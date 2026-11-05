"""Inspect the actual AAB before it can become a releasable artifact."""
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import sys
import xml.etree.ElementTree as ET
import zipfile

BUNDLETOOL_SHA256 = "a099cfa1543f55593bc2ed16a70a7c67fe54b1747bb7301f37fdfd6d91028e29"
VALIDATION = "bundletool-1.18.3-and-jar-signature"
PACKAGE = "com.company.ceovoicecalendar"
ANDROID = "{http://schemas.android.com/apk/res/android}"


def check_javascript_bundle(aab):
    with zipfile.ZipFile(aab) as archive:
        entries = [entry for entry in archive.infolist() if entry.filename == "base/assets/index.android.bundle"]
        if len(entries) != 1 or entries[0].is_dir() or entries[0].file_size == 0:
            raise ValueError("Release AAB must contain a nonempty embedded JavaScript bundle")


def check_manifest(xml, info):
    manifest = ET.fromstring(xml)
    if manifest.tag != "manifest" or manifest.get("package") != PACKAGE or info.get("applicationId") != PACKAGE:
        raise ValueError("Native AAB has an unexpected package")
    if manifest.get(ANDROID + "versionCode") != str(info.get("versionCode")):
        raise ValueError("Native AAB versionCode differs from build metadata")
    if manifest.get(ANDROID + "versionName") != info.get("version"):
        raise ValueError("Native AAB versionName differs from build metadata")
    application = manifest.find("application")
    if application is None or application.get(ANDROID + "debuggable", "false") != "false":
        raise ValueError("A release AAB must not be debuggable")
    sdk = manifest.find("uses-sdk")
    if sdk is None or int(sdk.get(ANDROID + "targetSdkVersion", "0")) < 36:
        raise ValueError("AAB targetSdkVersion must be at least 36 for Expo SDK 57")


def command(*args):
    result = subprocess.run(args, capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=180)
    if result.returncode:
        raise RuntimeError(f"Native AAB verification failed ({Path(args[0]).name}):\n{result.stderr}")
    return result.stdout


def validate_bundle(directory, bundletool):
    info_path = directory / "build-info.json"
    aab = directory / "igencheck.aab"
    info = json.loads(info_path.read_text(encoding="utf-8"))
    with bundletool.open("rb") as stream:
        if hashlib.file_digest(stream, "sha256").hexdigest() != BUNDLETOOL_SHA256:
            raise ValueError("bundletool checksum does not match the pinned version")
    with aab.open("rb") as stream:
        if hashlib.file_digest(stream, "sha256").hexdigest() != info.get("sha256"):
            raise ValueError("AAB checksum differs from build metadata")
    check_javascript_bundle(aab)
    certificate = info.get("signingCertificateSha256", "")
    if not re.fullmatch(r"[a-f0-9]{64}", certificate):
        raise ValueError("Upload certificate fingerprint is missing")
    java = str(Path(os.environ["JAVA_HOME"]) / "bin" / ("java.exe" if os.name == "nt" else "java")) if os.environ.get("JAVA_HOME") else "java"
    command(java, "-jar", str(bundletool), "validate", f"--bundle={aab}")
    xml = command(java, "-jar", str(bundletool), "dump", "manifest", f"--bundle={aab}", "--module=base")
    check_manifest(xml, info)
    verifier = Path(__file__).with_name("VerifyAndroidBundle.java")
    command(java, str(verifier), str(aab), certificate)
    info["nativeValidation"] = VALIDATION
    info_path.write_text(json.dumps(info, indent=2) + "\n", encoding="utf-8")
    print(f"Native AAB validated: {PACKAGE}, versionCode {info['versionCode']}, expected upload certificate.")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        sys.exit("Usage: check-android-bundle.py ARTIFACT_DIRECTORY BUNDLETOOL_JAR")
    try:
        validate_bundle(Path(sys.argv[1]).resolve(), Path(sys.argv[2]).resolve())
    except Exception as error:
        sys.exit(str(error))
