import datetime
import copy
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
            "CFBundleDisplayName": "iGen Check",
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


class WidgetArtifactTests(unittest.TestCase):
    info = ArtifactTests.info
    profile = ArtifactTests.profile

    def setUp(self):
        directory = tempfile.TemporaryDirectory()
        self.addCleanup(directory.cleanup)
        self.app = Path(directory.name) / "App.app"
        self.extension = self.app / "PlugIns" / "ExpoWidgetsTarget.appex"
        self.extension.mkdir(parents=True)
        self.info_value = {**self.info(), "ExpoWidgetsAppGroupIdentifier": CHECKER.WIDGET_GROUP}
        self.widget_info = {
            "CFBundleIdentifier": CHECKER.WIDGET_BUNDLE_ID,
            "CFBundleShortVersionString": self.info_value["CFBundleShortVersionString"],
            "CFBundleVersion": self.info_value["CFBundleVersion"],
            "ExpoWidgetsAppGroupIdentifier": CHECKER.WIDGET_GROUP,
            "NSExtension": {"NSExtensionPointIdentifier": "com.apple.widgetkit-extension"},
        }
        self.app_profile = self.profile()
        self.app_profile["Entitlements"]["com.apple.security.application-groups"] = [CHECKER.WIDGET_GROUP]
        self.app_signed = {
            **self.app_profile["Entitlements"], "com.apple.developer.team-identifier": CHECKER.TEAM_ID,
        }
        self.widget_profile = copy.deepcopy(self.app_profile)
        self.widget_profile["Entitlements"]["application-identifier"] = f"{CHECKER.TEAM_ID}.{CHECKER.WIDGET_BUNDLE_ID}"
        self.widget_signed = {
            **self.widget_profile["Entitlements"], "com.apple.developer.team-identifier": CHECKER.TEAM_ID,
        }
        self.write_info()
        (self.extension / "embedded.mobileprovision").write_bytes(b"fixture")

    def write_info(self):
        (self.extension / "Info.plist").write_bytes(plistlib.dumps(self.widget_info))

    def validate_widget(self):
        def fake_command(*args):
            if args[0] == "security":
                return plistlib.dumps(self.widget_profile)
            if args[:3] == ("codesign", "-d", "--entitlements"):
                return plistlib.dumps(self.widget_signed)
            return b""
        with patch.object(CHECKER, "command", side_effect=fake_command):
            return CHECKER.validate_widget_extension(self.app, self.info_value, self.app_signed, self.app_profile)

    def test_widget_with_matching_versions_signatures_and_groups_is_accepted(self):
        result = self.validate_widget()
        self.assertEqual(result["bundleIdentifier"], CHECKER.WIDGET_BUNDLE_ID)
        self.assertEqual(result["appGroup"], CHECKER.WIDGET_GROUP)

    def test_widget_missing_and_wrong_bundle_are_rejected(self):
        self.widget_info["CFBundleIdentifier"] = "com.igen.3s.widgets"
        self.write_info()
        with self.assertRaisesRegex(ValueError, "embed the today widget"):
            self.validate_widget()

    def test_widget_wrong_type_version_or_group_is_rejected(self):
        original = copy.deepcopy(self.widget_info)
        for key, value in [
            ("CFBundleVersion", "99"), ("CFBundleShortVersionString", "2.0.0"),
            ("ExpoWidgetsAppGroupIdentifier", "group.wrong"),
            ("NSExtension", {"NSExtensionPointIdentifier": "wrong.extension"}),
        ]:
            self.widget_info = {**original, key: value}
            self.write_info()
            with self.subTest(key=key), self.assertRaises(ValueError):
                self.validate_widget()

    def test_widget_requires_group_in_both_app_and_extension_signatures_and_profiles(self):
        for entitlements in [self.app_signed, self.app_profile["Entitlements"], self.widget_signed, self.widget_profile["Entitlements"]]:
            group = entitlements.pop("com.apple.security.application-groups")
            with self.subTest(entitlements=entitlements), self.assertRaisesRegex(ValueError, "App Group"):
                self.validate_widget()
            entitlements["com.apple.security.application-groups"] = group

    def test_widget_requires_its_own_store_profile(self):
        original = copy.deepcopy(self.widget_profile)
        for profile in [self.app_profile, {**original, "ProvisionedDevices": ["device"]},
                        {**original, "ExpirationDate": datetime.datetime(2000, 1, 1)}]:
            self.widget_profile = profile
            with self.subTest(profile=profile), self.assertRaises(ValueError):
                self.validate_widget()
        self.widget_profile = original
        (self.extension / "embedded.mobileprovision").unlink()
        with self.assertRaisesRegex(ValueError, "profile is missing"):
            self.validate_widget()

    def test_widget_wrong_signed_team_or_debug_build_is_rejected(self):
        original = copy.deepcopy(self.widget_signed)
        for key, value in [("application-identifier", f"{CHECKER.TEAM_ID}.{CHECKER.BUNDLE_ID}"),
                           ("com.apple.developer.team-identifier", "OTHER"), ("get-task-allow", True)]:
            self.widget_signed = {**original, key: value}
            with self.subTest(key=key), self.assertRaises(ValueError):
                self.validate_widget()

    def test_release_entry_point_requires_widget_validation(self):
        with patch.object(CHECKER.sys, "argv", ["check-ios-artifact.py", "app.ipa"]), \
                patch.object(CHECKER, "validate_ipa", side_effect=ValueError("sentinel")) as validate:
            with self.assertRaisesRegex(ValueError, "sentinel"):
                CHECKER.main()
        self.assertTrue(validate.call_args.kwargs["require_widget"])
