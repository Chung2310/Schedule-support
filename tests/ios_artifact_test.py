import datetime
import importlib.util
from pathlib import Path
import plistlib
import tempfile
import unittest
from unittest.mock import patch
import zipfile

SPEC = importlib.util.spec_from_file_location("ios_artifact", Path(__file__).parents[1] / "scripts/check-ios-artifact.py")
CHECKER = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(CHECKER)


class ArtifactTests(unittest.TestCase):
    def info(self):
        return {
            "CFBundleIdentifier": CHECKER.BUNDLE_ID,
            "CFBundleDisplayName": "Schedule Support",
            "CFBundleVersion": "5", "CFBundleShortVersionString": "1.0.0",
            "CFBundleSupportedPlatforms": ["iPhoneOS"],
            **{key: "A meaningful permission description" for key in CHECKER.PURPOSE_STRINGS},
        }

    def profile(self):
        return {
            "TeamIdentifier": [CHECKER.TEAM_ID],
            "ExpirationDate": datetime.datetime(2099, 1, 1),
            "Entitlements": {
                "application-identifier": f"{CHECKER.TEAM_ID}.{CHECKER.BUNDLE_ID}",
                "get-task-allow": False,
            },
        }

    def archive(self, info, extra=None):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        path = Path(directory.name) / "app.ipa"
        with zipfile.ZipFile(path, "w") as archive:
            archive.writestr("Payload/App.app/Info.plist", plistlib.dumps(info))
            archive.writestr("Payload/App.app/embedded.mobileprovision", b"fixture")
            archive.writestr("Payload/App.app/PrivacyInfo.xcprivacy", plistlib.dumps({}))
            for name, value in (extra or {}).items():
                archive.writestr(name, value)
        return path

    def test_valid_archive_and_profile(self):
        _, info, _, count = CHECKER.inspect_archive(self.archive(self.info()))
        self.assertEqual(info["CFBundleVersion"], "5")
        self.assertEqual(count, 1)
        self.assertTrue(CHECKER.validate_profile(self.profile()).startswith("2099"))

    def test_missing_photo_purpose_reproduces_apple_rejection(self):
        info = self.info()
        del info["NSPhotoLibraryUsageDescription"]
        with self.assertRaisesRegex(ValueError, "NSPhotoLibraryUsageDescription"):
            CHECKER.inspect_archive(self.archive(info))

    def test_wrong_bundle_and_simulator_build_rejected(self):
        for patch_value in [{"CFBundleIdentifier": "com.igen.3s"}, {"CFBundleSupportedPlatforms": ["iPhoneSimulator"]}]:
            with self.subTest(patch=patch_value), self.assertRaises(ValueError):
                CHECKER.inspect_archive(self.archive({**self.info(), **patch_value}))

    def test_unsafe_paths_and_invalid_privacy_manifests_rejected(self):
        for name, contents in [("../outside", b"bad"), ("Payload/App.app/Other/PrivacyInfo.xcprivacy", b"not a plist")]:
            with self.subTest(name=name), self.assertRaises((ValueError, plistlib.InvalidFileException)):
                CHECKER.inspect_archive(self.archive(self.info(), {name: contents}))

    def test_expired_development_and_other_app_profiles_rejected(self):
        for field, value in [("ExpirationDate", datetime.datetime(2000, 1, 1)), ("TeamIdentifier", ["OTHER"]),
                             ("ProvisionedDevices", ["device"]), ("ProvisionsAllDevices", True)]:
            with self.subTest(field=field), self.assertRaises(ValueError):
                CHECKER.validate_profile({**self.profile(), field: value})
        for field, value in [("get-task-allow", True), ("application-identifier", f"{CHECKER.TEAM_ID}.com.igen.3s")]:
            profile = self.profile()
            profile["Entitlements"][field] = value
            with self.subTest(field=field), self.assertRaises(ValueError):
                CHECKER.validate_profile(profile)

    def test_native_verification_pipeline_and_build_metadata(self):
        ipa = self.archive(self.info())
        entitlements = {
            "application-identifier": f"{CHECKER.TEAM_ID}.{CHECKER.BUNDLE_ID}",
            "com.apple.developer.team-identifier": CHECKER.TEAM_ID,
        }
        def fake_command(*args):
            if args[0] == "security":
                return plistlib.dumps(self.profile())
            if args[:3] == ("codesign", "-d", "--entitlements"):
                return plistlib.dumps(entitlements)
            if args[0] == "xcodebuild":
                return b"Xcode 26.5\nBuild version fixture"
            return b""
        with patch.object(CHECKER.sys, "platform", "darwin"), patch.object(CHECKER, "command", side_effect=fake_command) as commands:
            result = CHECKER.validate_ipa(ipa)
        self.assertEqual(result["version"], "1.0.0")
        self.assertEqual(len(result["sha256"]), 64)
        self.assertTrue(any(call.args[:4] == ("codesign", "--verify", "--deep", "--strict") for call in commands.call_args_list))
