package expo.modules.meetingvoice

import android.app.NotificationChannel
import android.app.NotificationManager
import android.media.AudioAttributes
import android.media.MediaMetadataRetriever
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import android.speech.tts.Voice
import androidx.core.content.FileProvider
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.io.File
import java.security.MessageDigest

class MeetingVoiceFileProvider : FileProvider()

class MeetingVoiceModule : Module() {
  private val handler = Handler(Looper.getMainLooper())
  private var cancelJob: (() -> Unit)? = null

  override fun definition() = ModuleDefinition {
    Name("MeetingVoice")
    AsyncFunction("getAvailableVoices") { promise: Promise ->
      val context = appContext.reactContext
      if (context == null) {
        promise.resolve(emptyList<Map<String, String>>())
        return@AsyncFunction
      }
      var engine: TextToSpeech? = null
      engine = TextToSpeech(context) { status ->
        handler.post {
          val tts = engine
          val voices = if (status == TextToSpeech.SUCCESS && tts != null) {
            tts.voices?.filter { it.locale.language == "vi" && !it.isNetworkConnectionRequired }
              ?.sortedBy { it.name }
              ?.map { voice -> mapOf(
                "identifier" to voice.name,
                "name" to voice.name,
                "language" to voice.locale.toLanguageTag(),
                "quality" to if (voice.quality >= Voice.QUALITY_HIGH) "Enhanced" else "Default"
              ) } ?: emptyList()
          } else emptyList()
          tts?.shutdown()
          promise.resolve(voices)
        }
      }
    }
    AsyncFunction("prepare") { text: String, rate: Double, pitch: Double, voiceIdentifier: String, promise: Promise ->
      handler.post { prepare(text, rate, pitch, voiceIdentifier, promise) }
    }
    AsyncFunction("prune") { keys: List<String> ->
      val context = appContext.reactContext ?: return@AsyncFunction
      val cutoff = System.currentTimeMillis() - 7L * 24 * 60 * 60 * 1000
      File(context.filesDir, "meeting-voice").listFiles()?.forEach { file ->
        if (file.name.matches(Regex("mv_[a-f0-9]{64}\\.wav")) &&
            file.nameWithoutExtension !in keys && file.lastModified() < cutoff) {
          if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            context.getSystemService(NotificationManager::class.java).deleteNotificationChannel(file.nameWithoutExtension)
          }
          file.delete()
        }
      }
    }
    OnDestroy { handler.post { cancelJob?.invoke() } }
  }

  private fun prepare(text: String, rate: Double, pitch: Double, voiceIdentifier: String, promise: Promise) {
    val context = appContext.reactContext
    if (context == null || Build.VERSION.SDK_INT < Build.VERSION_CODES.O) {
      promise.reject("UNSUPPORTED", "Voice notification sounds require Android 8 or newer", null)
      return
    }
    if (cancelJob != null || text.isBlank() || text.length > 600 || !rate.isFinite() || !pitch.isFinite()) {
      promise.reject("INVALID_REQUEST", "Speech request is invalid or another request is in progress", null)
      return
    }
    val key = "mv_" + MessageDigest.getInstance("SHA-256")
      .digest("v2|vi-VN|$voiceIdentifier|$rate|$pitch|$text".toByteArray(Charsets.UTF_8)).joinToString("") { "%02x".format(it) }
    val directory = File(context.filesDir, "meeting-voice").apply { mkdirs() }
    val output = File(directory, "$key.wav")
    val temporary = File(directory, "$key.tmp.wav")
    var engine: TextToSpeech? = null
    var done = false
    var timeout: Runnable? = null

    fun finish(error: String? = null) {
      if (done) return
      done = true
      timeout?.let { handler.removeCallbacks(it) }
      engine?.stop()
      engine?.shutdown()
      cancelJob = null
      temporary.delete()
      if (error != null) {
        promise.reject("VOICE_FAILED", error, null)
        return
      }
      try {
        val uri = FileProvider.getUriForFile(context, "${context.packageName}.meetingvoice", output)
        val channel = NotificationChannel(key, "Giọng đọc lịch hẹn", NotificationManager.IMPORTANCE_HIGH)
        channel.setSound(uri, AudioAttributes.Builder()
          .setUsage(AudioAttributes.USAGE_NOTIFICATION).setContentType(AudioAttributes.CONTENT_TYPE_SPEECH).build())
        channel.enableVibration(true)
        channel.vibrationPattern = longArrayOf(0, 500, 250, 500)
        context.getSystemService(NotificationManager::class.java).createNotificationChannel(channel)
        output.setLastModified(System.currentTimeMillis())
        promise.resolve(mapOf("key" to key, "sound" to output.name, "channelId" to key))
      } catch (error: Exception) {
        promise.reject("VOICE_CHANNEL_FAILED", error.message, error)
      }
    }

    cancelJob = { finish("Speech generation cancelled") }
    if (output.length() > 44) { finish(); return }
    timeout = Runnable { finish("Speech generation timed out") }
    handler.postDelayed(timeout!!, 20000)
    try {
      engine = TextToSpeech(context) { status ->
        handler.post {
          if (done) return@post
          val tts = engine
          if (status != TextToSpeech.SUCCESS || tts == null) {
            finish("Could not initialize text to speech")
            return@post
          }
          try {
            // Use an installed voice so meeting content is not sent to a server.
            val voices = tts.voices?.filter { it.locale.language == "vi" && !it.isNetworkConnectionRequired }
              ?.sortedBy { it.name } ?: emptyList()
            val voice = if (voiceIdentifier.isBlank()) voices.firstOrNull()
              else voices.firstOrNull { it.name == voiceIdentifier }
            if (voice == null && voiceIdentifier.isNotBlank()) {
              finish("Selected Vietnamese voice is not installed")
              return@post
            }
            if (voice == null || tts.setVoice(voice) == TextToSpeech.ERROR) {
              finish("No installed offline Vietnamese voice")
              return@post
            }
            tts.setSpeechRate(rate.toFloat().coerceIn(0.5f, 2f))
            tts.setPitch(pitch.toFloat().coerceIn(0.5f, 2f))
            tts.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
              override fun onStart(id: String?) {}
              override fun onError(id: String?) { handler.post { finish("Speech synthesis failed") } }
              override fun onDone(id: String?) {
                handler.post complete@{
                  if (done) return@complete
                  try {
                    val metadata = MediaMetadataRetriever()
                    val duration = try {
                      metadata.setDataSource(temporary.absolutePath)
                      metadata.extractMetadata(MediaMetadataRetriever.METADATA_KEY_DURATION)?.toLongOrNull() ?: 0
                    } finally { metadata.release() }
                    if (temporary.length() <= 44 || duration !in 1L..29000L) {
                      finish("Voice notification must be shorter than 30 seconds")
                    } else if (!temporary.renameTo(output)) {
                      finish("Could not save speech file")
                    } else finish()
                  } catch (error: Exception) { finish(error.message ?: "Invalid speech file") }
                }
              }
            })
            if (tts.synthesizeToFile(text, Bundle(), temporary, key) == TextToSpeech.ERROR) {
              finish("Could not start speech synthesis")
            }
          } catch (error: Exception) { finish(error.message ?: "Speech synthesis failed") }
        }
      }
    } catch (error: Exception) { finish(error.message ?: "Could not initialize speech") }
  }
}
