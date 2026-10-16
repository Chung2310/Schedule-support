Pod::Spec.new do |s|
  s.name = 'MeetingVoice'
  s.version = '1.0.0'
  s.summary = 'Local speech files for meeting notifications'
  s.description = 'Generates notification speech on the device without a backend.'
  s.license = { :type => 'Proprietary' }
  s.author = 'Schedule Support'
  s.homepage = 'https://expo.dev'
  s.source = { :git => 'https://github.com/expo/expo.git' }
  s.platforms = { :ios => '16.4' }
  s.swift_version = '5.9'
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.source_files = '**/*.swift'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
end
