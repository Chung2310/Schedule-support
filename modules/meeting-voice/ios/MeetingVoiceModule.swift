import ExpoModulesCore
import AVFoundation
import CryptoKit
import UserNotifications

private struct VoiceNotification: Record {
  @Field var identifier: String = ""
  @Field var title: String = ""
  @Field var subtitle: String = ""
  @Field var body: String = ""
  @Field var sound: String = ""
  @Field var meetingId: String = ""
  @Field var fireAt: Double = 0
}

public final class MeetingVoiceModule: Module {
  private var job: VoiceFileJob?

  public func definition() -> ModuleDefinition {
    Name("MeetingVoice")
    AsyncFunction("getAvailableVoices") { () -> [[String: String]] in
      AVSpeechSynthesisVoice.speechVoices()
        .filter { $0.language.lowercased().hasPrefix("vi") }
        .map { voice in
          [
            "identifier": voice.identifier,
            "name": voice.name,
            "language": voice.language,
            "quality": voice.quality == .enhanced ? "Enhanced" : "Default"
          ]
        }
    }
    // Schedule directly because Expo's bundle-only sound check does not
    // recognize runtime files in Library/Sounds (supported by iOS itself).
    AsyncFunction("scheduleIOS") { (input: VoiceNotification, promise: Promise) in
      let content = UNMutableNotificationContent()
      content.title = input.title
      content.subtitle = input.subtitle
      content.body = input.body
      content.categoryIdentifier = "MEETING_ALARM_ACTIONS"
      content.userInfo = ["meetingId": input.meetingId]
      content.sound = UNNotificationSound(named: UNNotificationSoundName(rawValue: input.sound))
      let date = Date(timeIntervalSince1970: input.fireAt / 1000)
      guard date > Date() else { promise.resolve(nil); return }
      let components = Calendar.current.dateComponents([.year, .month, .day, .hour, .minute, .second], from: date)
      let trigger = UNCalendarNotificationTrigger(dateMatching: components, repeats: false)
      UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: input.identifier, content: content, trigger: trigger)) { error in
        if let error = error { promise.reject("SCHEDULE_FAILED", error.localizedDescription) }
        else { promise.resolve(nil) }
      }
    }
    AsyncFunction("prepare") { (text: String, rate: Double, pitch: Double, voiceIdentifier: String, promise: Promise) in
      guard self.job == nil, !text.isEmpty, text.count <= 600, rate.isFinite, pitch.isFinite else {
        promise.reject("INVALID_REQUEST", "Invalid speech request or another request is in progress")
        return
      }
      do {
        let directory = try self.soundDirectory()
        let digest = SHA256.hash(data: Data("v2|vi-VN|\(voiceIdentifier)|\(rate)|\(pitch)|\(text)".utf8))
        let key = "mv_" + digest.map { String(format: "%02x", $0) }.joined()
        let output = directory.appendingPathComponent("\(key).caf")
        if let file = try? AVAudioFile(forReading: output), file.length > 0 {
          try FileManager.default.setAttributes([.modificationDate: Date()], ofItemAtPath: output.path)
          promise.resolve(["key": key, "sound": output.lastPathComponent])
          return
        }
        let voices = AVSpeechSynthesisVoice.speechVoices().filter { $0.language.lowercased().hasPrefix("vi") }
        let selectedVoice = voiceIdentifier.isEmpty
          ? nil
          : voices.first(where: { $0.identifier == voiceIdentifier })
        guard let voice = selectedVoice ?? voices.first else {
          promise.reject("VOICE_UNAVAILABLE", "No installed Vietnamese voice")
          return
        }
        let job = VoiceFileJob(output: output) { [weak self] error in
          self?.job = nil
          if let error = error {
            promise.reject("VOICE_FAILED", error)
          } else {
            promise.resolve(["key": key, "sound": output.lastPathComponent])
          }
        }
        self.job = job
        job.start(text: text, voice: voice, rate: rate, pitch: pitch)
      } catch {
        promise.reject("VOICE_FAILED", error.localizedDescription)
      }
    }.runOnQueue(.main)

    AsyncFunction("prune") { (keys: [String]) in
      let directory = try self.soundDirectory()
      let keep = Set(keys)
      for url in try FileManager.default.contentsOfDirectory(at: directory, includingPropertiesForKeys: [.contentModificationDateKey]) {
        let key = url.deletingPathExtension().lastPathComponent
        guard url.pathExtension == "caf", key.range(of: "^mv_[a-f0-9]{64}$", options: .regularExpression) != nil,
              !keep.contains(key) else { continue }
        let modified = try url.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate ?? Date()
        if modified < Date().addingTimeInterval(-7 * 24 * 60 * 60) {
          try FileManager.default.removeItem(at: url)
        }
      }
    }.runOnQueue(.main)

    OnDestroy {
      DispatchQueue.main.async { self.job?.cancel() }
    }
  }

  private func soundDirectory() throws -> URL {
    let library = try FileManager.default.url(for: .libraryDirectory, in: .userDomainMask, appropriateFor: nil, create: true)
    let directory = library.appendingPathComponent("Sounds", isDirectory: true)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    return directory
  }
}

private final class VoiceFileJob {
  private let synthesizer = AVSpeechSynthesizer()
  private let output: URL
  private let temporary: URL
  private let completion: (String?) -> Void
  private var file: AVAudioFile?
  private var frames: AVAudioFramePosition = 0
  private var completed = false
  private var timeout: DispatchWorkItem?

  init(output: URL, completion: @escaping (String?) -> Void) {
    self.output = output
    self.temporary = output.deletingPathExtension().appendingPathExtension("tmp.caf")
    self.completion = completion
  }

  func start(text: String, voice: AVSpeechSynthesisVoice, rate: Double, pitch: Double) {
    try? FileManager.default.removeItem(at: temporary)
    let utterance = AVSpeechUtterance(string: text)
    utterance.voice = voice
    utterance.rate = Float(min(2, max(0.5, rate))) * AVSpeechUtteranceDefaultSpeechRate
    utterance.pitchMultiplier = Float(min(2, max(0.5, pitch)))
    let timeout = DispatchWorkItem { [weak self] in self?.finish("Speech generation timed out") }
    self.timeout = timeout
    DispatchQueue.main.asyncAfter(deadline: .now() + 20, execute: timeout)
    synthesizer.write(utterance) { [weak self] buffer in
      DispatchQueue.main.async { self?.consume(buffer) }
    }
  }

  func cancel() { finish("Speech generation cancelled") }

  private func consume(_ buffer: AVAudioBuffer) {
    guard !completed, let pcm = buffer as? AVAudioPCMBuffer else { return }
    if pcm.frameLength == 0 {
      finish(frames > 0 ? nil : "Speech synthesis produced no audio")
      return
    }
    do {
      // Apple notification sounds must be shorter than 30 seconds.
      guard Double(frames + AVAudioFramePosition(pcm.frameLength)) / pcm.format.sampleRate < 29 else {
        finish("Voice notification must be shorter than 30 seconds")
        return
      }
      if file == nil {
        file = try AVAudioFile(forWriting: temporary, settings: [
          AVFormatIDKey: kAudioFormatLinearPCM,
          AVSampleRateKey: pcm.format.sampleRate,
          AVNumberOfChannelsKey: pcm.format.channelCount,
          AVLinearPCMBitDepthKey: 16,
          AVLinearPCMIsFloatKey: false,
          AVLinearPCMIsBigEndianKey: false
        ], commonFormat: pcm.format.commonFormat, interleaved: pcm.format.isInterleaved)
      }
      try file?.write(from: pcm)
      frames += AVAudioFramePosition(pcm.frameLength)
    } catch { finish(error.localizedDescription) }
  }

  private func finish(_ error: String?) {
    guard !completed else { return }
    completed = true
    timeout?.cancel()
    synthesizer.stopSpeaking(at: .immediate)
    file = nil // Close and finalize the audio container before moving it.
    var failure = error
    if failure == nil {
      do {
        if FileManager.default.fileExists(atPath: output.path) { try FileManager.default.removeItem(at: output) }
        try FileManager.default.moveItem(at: temporary, to: output)
        try FileManager.default.setAttributes([.protectionKey: FileProtectionType.none], ofItemAtPath: output.path)
      } catch { failure = error.localizedDescription }
    }
    try? FileManager.default.removeItem(at: temporary)
    completion(failure)
  }
}
