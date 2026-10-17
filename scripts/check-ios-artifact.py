"""Validate the actual signed IPA on macOS before publishing a build artifact."""
import datetime
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import plistlib
import re
import subprocess
import sys
import tempfile
import zipfile

BUNDLE_ID = "com.igen.schedule"
TEAM_ID = "VP77TD9A77"
WIDGET_BUNDLE_ID = "com.igen.schedule.widgets"
WIDGET_GROUP = "group.com.igen.schedule"
PURPOSE_STRINGS = (
    "NSMicrophoneUsageDescription",
    "NSSpeechRecognitionUsageDescription",
    "NSPhotoLibraryUsageDescription",
)


def require(condition, message):
    if not condition:
        raise ValueError(message)


def inspect_archive(ipa):
    with zipfile.ZipFile(ipa) as archive:
        names = archive.namelist()
        for name in names:
            entry = PurePosixPath(name)
            require(not entry.is_absolute() and ".." not in entry.parts and "\\" not in name,
                    "IPA contains an unsafe archive path.")
        roots = {str(PurePosixPath(name).parent) for name in names
                 if re.fullmatch(r"Payload/[^/]+\.app/Info\.plist", name)}
        require(len(roots) == 1, "IPA must contain exactly one top-level iOS app.")
        app_root = roots.pop()
        info = plistlib.loads(archive.read(f"{app_root}/Info.plist"))
        require(info.get("CFBundleIdentifier") == BUNDLE_ID, "Wrong IPA bundle identifier.")
        require(info.get("CFBundleDisplayName") == "iGen Check", "Wrong IPA display name.")
        for key in PURPOSE_STRINGS:
            value = info.get(key)
            require(isinstance(value, str) and value.strip(), f"Missing privacy purpose string: {key}")
        for key in ("CFBundleShortVersionString", "CFBundleVersion"):
            value = info.get(key)
            require(isinstance(value, str) and re.fullmatch(r"\d+(?:\.\d+){0,2}", value),
                    f"Invalid IPA version field: {key}")
        require("iPhoneOS" in info.get("CFBundleSupportedPlatforms", []), "IPA is not an iPhone device build.")
        require("audio" not in info.get("UIBackgroundModes", []), "Unexpected background audio mode.")
        profile_path = f"{app_root}/embedded.mobileprovision"
        require(profile_path in names, "IPA has no embedded provisioning profile.")
        # Parse every included privacy manifest instead of assuming source config reached the IPA.
        manifests = [name for name in names if name.endswith("/PrivacyInfo.xcprivacy")]
        require(manifests, "IPA contains no privacy manifests.")
        for name in manifests:
            require(isinstance(plistlib.loads(archive.read(name)), dict), f"Invalid privacy manifest: {name}")
        return app_root, info, archive.read(profile_path), len(manifests)


def validate_profile(profile, now=None, bundle_identifier=BUNDLE_ID):
    now = now or datetime.datetime.now(datetime.timezone.utc)
    require(TEAM_ID in profile.get("TeamIdentifier", []), "Wrong provisioning profile team.")
    entitlements = profile.get("Entitlements", {})
    require(entitlements.get("application-identifier") == f"{TEAM_ID}.{bundle_identifier}",
            "Provisioning profile belongs to another app.")
    require(entitlements.get("get-task-allow") is False, "Development provisioning profile is not allowed.")
    require(not profile.get("ProvisionedDevices") and not profile.get("ProvisionsAllDevices"),
            "Expected an App Store distribution profile.")
    expiry = profile.get("ExpirationDate")
    require(isinstance(expiry, datetime.datetime), "Profile expiration date is missing.")
    if expiry.tzinfo is None:
        expiry = expiry.replace(tzinfo=datetime.timezone.utc)
    require(expiry > now, "Provisioning profile has expired.")
    return expiry.isoformat()


def command(*args):
    return subprocess.run(args, check=True, stdout=subprocess.PIPE, stderr=subprocess.PIPE).stdout


def validate_widget_extension(app, info, app_entitlements, app_profile):
    require(info.get("ExpoWidgetsAppGroupIdentifier") == WIDGET_GROUP,
            "Signed app has the wrong widget App Group configuration.")
    for entitlements in (app_entitlements, app_profile.get("Entitlements", {})):
        require(WIDGET_GROUP in entitlements.get("com.apple.security.application-groups", []),
                "App signature/profile is missing the widget App Group. Regenerate its profile.")
    extensions = []
    for extension in (app / "PlugIns").glob("*.appex"):
        widget_info = plistlib.loads((extension / "Info.plist").read_bytes())
        if widget_info.get("CFBundleIdentifier") == WIDGET_BUNDLE_ID:
            extensions.append((extension, widget_info))
    require(len(extensions) == 1, "IPA must embed the today widget extension exactly once.")
    extension, widget_info = extensions[0]
    require(widget_info.get("NSExtension", {}).get("NSExtensionPointIdentifier") == "com.apple.widgetkit-extension",
            "Embedded widget has the wrong extension type.")
    for key in ("CFBundleShortVersionString", "CFBundleVersion"):
        require(widget_info.get(key) == info[key], f"Widget/app version mismatch: {key}")
    require(widget_info.get("ExpoWidgetsAppGroupIdentifier") == WIDGET_GROUP,
            "Widget extension uses a different App Group.")
    profile_path = extension / "embedded.mobileprovision"
    require(profile_path.is_file(), "Widget provisioning profile is missing.")
    profile = plistlib.loads(command("security", "cms", "-D", "-i", str(profile_path)))
    expiry = validate_profile(profile, bundle_identifier=WIDGET_BUNDLE_ID)
    command("codesign", "--verify", "--strict", str(extension))
    signed = plistlib.loads(command("codesign", "-d", "--entitlements", ":-", str(extension)))
    require(signed.get("application-identifier") == f"{TEAM_ID}.{WIDGET_BUNDLE_ID}",
            "Widget signed application identifier is incorrect.")
    require(signed.get("com.apple.developer.team-identifier") == TEAM_ID,
            "Widget is signed by another Apple Team.")
    require(signed.get("get-task-allow", False) is False, "Widget allows debugging.")
    for entitlements in (signed, profile.get("Entitlements", {})):
        require(WIDGET_GROUP in entitlements.get("com.apple.security.application-groups", []),
                "Widget signature/profile is missing the shared App Group.")
    return {"bundleIdentifier": WIDGET_BUNDLE_ID, "appGroup": WIDGET_GROUP, "profileExpiresAt": expiry}


def validate_ipa(ipa, require_widget=False):
    # CLI releases require the widget; callers inspecting older IPAs can omit it.
    require(sys.platform == "darwin", "Signature verification requires the macOS build runner.")
    require(ipa.is_file() and ipa.stat().st_size > 0, "IPA file is missing or empty.")
    app_root, info, profile_bytes, manifest_count = inspect_archive(ipa)
    widget = None
    with tempfile.TemporaryDirectory(prefix="schedule-ipa-check-") as directory:
        directory = Path(directory)
        profile_file = directory / "embedded.mobileprovision"
        profile_file.write_bytes(profile_bytes)
        profile = plistlib.loads(command("security", "cms", "-D", "-i", str(profile_file)))
        expiry = validate_profile(profile)
        extracted = directory / "unpacked"
        # ditto preserves framework symlinks and executable modes for codesign verification.
        command("ditto", "-x", "-k", str(ipa), str(extracted))
        app = extracted / app_root
        command("codesign", "--verify", "--deep", "--strict", str(app))
        entitlements = plistlib.loads(command("codesign", "-d", "--entitlements", ":-", str(app)))
        require(entitlements.get("application-identifier") == f"{TEAM_ID}.{BUNDLE_ID}",
                "Signed application identifier does not match the provisioning profile.")
        require(entitlements.get("com.apple.developer.team-identifier") == TEAM_ID,
                "Signed app belongs to another Apple Team.")
        require(entitlements.get("get-task-allow", False) is False, "IPA allows debugging.")
        if require_widget:
            widget = validate_widget_extension(app, info, entitlements, profile)
    digest = hashlib.sha256()
    with ipa.open("rb") as stream:
        for block in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(block)
    result = {
        "file": ipa.name,
        "bundleIdentifier": BUNDLE_ID,
        "displayName": info["CFBundleDisplayName"],
        "version": info["CFBundleShortVersionString"],
        "buildNumber": info["CFBundleVersion"],
        "appleTeam": TEAM_ID,
        "profileExpiresAt": expiry,
        "privacyManifestCount": manifest_count,
        "sha256": digest.hexdigest(),
        "commit": os.environ.get("GITHUB_SHA", ""),
        "xcode": command("xcodebuild", "-version").decode().strip(),
    }
    if widget:
        result["widget"] = widget
    return result


def main():
    require(len(sys.argv) == 2, "Usage: python3 scripts/check-ios-artifact.py <file.ipa>")
    ipa = Path(sys.argv[1]).resolve()
    result = validate_ipa(ipa, require_widget=True)
    (ipa.parent / "build-info.json").write_text(json.dumps(result, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(result, indent=2))
    if os.environ.get("GITHUB_STEP_SUMMARY"):
        with open(os.environ["GITHUB_STEP_SUMMARY"], "a", encoding="utf-8") as summary:
            summary.write("## Validated production IPA\n\n")
            summary.write(f"Version **{result['version']}**, build **{result['buildNumber']}**\n\n")
            summary.write(f"Bundle: `{BUNDLE_ID}` · Team: `{TEAM_ID}`\n\n")
            summary.write(f"Widget: `{WIDGET_BUNDLE_ID}` · App Group: `{WIDGET_GROUP}`\n\n")
            summary.write(f"Commit: `{result['commit']}`\n\nSHA-256: `{result['sha256']}`\n\n")
            summary.write("Download the signed IPA and build-info.json from this run's Artifacts.\n")


if __name__ == "__main__":
    try:
        main()
    except subprocess.CalledProcessError as error:
        print(f"IPA validation failed: {error.stderr.decode(errors='replace')}", file=sys.stderr)
        sys.exit(1)
    except (ValueError, OSError, zipfile.BadZipFile, plistlib.InvalidFileException, KeyError) as error:
        print(f"IPA validation failed: {error}", file=sys.stderr)
        sys.exit(1)
