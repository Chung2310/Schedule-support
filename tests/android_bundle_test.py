import hashlib
import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest
from unittest.mock import patch
import zipfile

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location("android_bundle", ROOT / "scripts/check-android-bundle.py")
bundle = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bundle)


def manifest(package=bundle.PACKAGE, code="12001", version="1.0.0", debug="false", target="36"):
    return (f'<manifest xmlns:android="http://schemas.android.com/apk/res/android" package="{package}" '
            f'android:versionCode="{code}" android:versionName="{version}">'
            f'<uses-sdk android:targetSdkVersion="{target}"/><application android:debuggable="{debug}"/></manifest>')


class ManifestTests(unittest.TestCase):
    def test_release_requires_an_embedded_javascript_bundle(self):
        with tempfile.TemporaryDirectory() as temporary:
            aab = Path(temporary) / "igencheck.aab"
            for entries in [{"base/manifest/AndroidManifest.xml": b"manifest"},
                            {"base/assets/index.android.bundle": b""}]:
                with self.subTest(entries=entries):
                    with zipfile.ZipFile(aab, "w") as archive:
                        for name, content in entries.items():
                            archive.writestr(name, content)
                    with self.assertRaisesRegex(ValueError, "embedded JavaScript bundle"):
                        bundle.check_javascript_bundle(aab)
            with zipfile.ZipFile(aab, "w") as archive:
                archive.writestr("base/assets/index.android.bundle", b"bundled application")
            bundle.check_javascript_bundle(aab)
            aab.write_bytes(b"invalid archive")
            with self.assertRaises(zipfile.BadZipFile):
                bundle.check_javascript_bundle(aab)

    def test_native_manifest_must_match_the_release_and_not_enable_debugging(self):
        info = {"applicationId": bundle.PACKAGE, "versionCode": 12001, "version": "1.0.0"}
        bundle.check_manifest(manifest(), info)
        for change in [{"package": "com.other.app"}, {"code": "1"}, {"version": "0.9.0"},
                       {"debug": "true"}, {"target": "35"}]:
            with self.subTest(change=change), self.assertRaises(ValueError):
                bundle.check_manifest(manifest(**change), info)

    def test_a_failed_binary_check_cannot_mark_metadata_as_verified(self):
        with tempfile.TemporaryDirectory() as temporary:
            directory = Path(temporary)
            aab = directory / "igencheck.aab"
            with zipfile.ZipFile(aab, "w") as archive:
                archive.writestr("base/assets/index.android.bundle", b"bundled application")
            tool = directory / "bundletool.jar"
            tool.write_bytes(b"test-tool")
            info = {"applicationId": bundle.PACKAGE, "versionCode": 12001, "version": "1.0.0",
                    "signingCertificateSha256": "a" * 64, "sha256": hashlib.sha256(aab.read_bytes()).hexdigest()}
            info_path = directory / "build-info.json"
            info_path.write_text(json.dumps(info), encoding="utf-8")
            with patch.object(bundle, "BUNDLETOOL_SHA256", hashlib.sha256(b"test-tool").hexdigest()):
                with patch.object(bundle, "command", side_effect=["", manifest(), RuntimeError("bad signer")]):
                    with self.assertRaisesRegex(RuntimeError, "bad signer"):
                        bundle.validate_bundle(directory, tool)
                    self.assertNotIn("nativeValidation", json.loads(info_path.read_text()))
                with patch.object(bundle, "command", side_effect=["", manifest(), "valid signer"]):
                    bundle.validate_bundle(directory, tool)
                self.assertEqual(json.loads(info_path.read_text())["nativeValidation"], bundle.VALIDATION)


@unittest.skipUnless(os.environ.get("RUN_ANDROID_JAVA_TESTS") == "1", "Set RUN_ANDROID_JAVA_TESTS=1 for real JDK signing checks")
class SignatureTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temporary = tempfile.TemporaryDirectory()
        cls.directory = Path(cls.temporary.name)
        cls.java_bin = Path(os.environ["JAVA_HOME"]) / "bin" if os.environ.get("JAVA_HOME") else None
        cls.tools = {name: str(cls.java_bin / (name + (".exe" if os.name == "nt" else ""))) if cls.java_bin else shutil.which(name)
                     for name in ["java", "keytool", "jarsigner"]}
        cls.env = {**os.environ, "CI_TEST_STORE_PASSWORD": "ci-test-only-password"}
        cls.keystore = cls.directory / "upload.p12"
        cls.execute(cls.tools["keytool"], "-genkeypair", "-keystore", str(cls.keystore), "-storetype", "PKCS12",
                    "-alias", "upload", "-storepass:env", "CI_TEST_STORE_PASSWORD", "-keypass:env", "CI_TEST_STORE_PASSWORD",
                    "-keyalg", "RSA", "-keysize", "2048", "-validity", "2", "-dname", "CN=CI verification test", "-noprompt")
        cert = cls.execute(cls.tools["keytool"], "-exportcert", "-keystore", str(cls.keystore), "-alias", "upload",
                           "-storepass:env", "CI_TEST_STORE_PASSWORD")
        cls.fingerprint = hashlib.sha256(cert).hexdigest()
        cls.unsigned = cls.directory / "unsigned.aab"
        with zipfile.ZipFile(cls.unsigned, "w") as archive:
            archive.writestr("base/manifest/AndroidManifest.xml", b"test payload")
            archive.writestr("META-INF/services/example", b"signed metadata payload")
        cls.signed = cls.directory / "signed.aab"
        shutil.copyfile(cls.unsigned, cls.signed)
        cls.execute(cls.tools["jarsigner"], "-keystore", str(cls.keystore), "-storepass:env", "CI_TEST_STORE_PASSWORD",
                    "-keypass:env", "CI_TEST_STORE_PASSWORD", str(cls.signed), "upload")

    @classmethod
    def tearDownClass(cls):
        cls.temporary.cleanup()

    @classmethod
    def execute(cls, *args):
        return subprocess.run(args, env=cls.env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True, timeout=60).stdout

    def verify(self, file, fingerprint=None):
        return subprocess.run([self.tools["java"], str(ROOT / "scripts/VerifyAndroidBundle.java"), str(file), fingerprint or self.fingerprint],
                              stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=60)

    def test_correct_upload_signature_is_accepted(self):
        result = self.verify(self.signed)
        self.assertEqual(result.returncode, 0, result.stderr.decode(errors="replace"))

    def test_upload_private_key_and_both_passwords_are_checked_before_build(self):
        env = {**self.env, "ANDROID_KEYSTORE_PASSWORD": "ci-test-only-password",
               "ANDROID_KEY_PASSWORD": "ci-test-only-password", "ANDROID_KEY_ALIAS": "upload"}
        args = [self.tools["java"], str(ROOT / "scripts/VerifyAndroidBundle.java"), "--keystore", str(self.keystore)]
        result = subprocess.run(args, env=env, capture_output=True, timeout=60)
        self.assertEqual(result.returncode, 0, result.stderr.decode(errors="replace"))
        self.assertEqual(result.stdout.decode().strip(), self.fingerprint)
        for key in ["ANDROID_KEYSTORE_PASSWORD", "ANDROID_KEY_PASSWORD", "ANDROID_KEY_ALIAS"]:
            with self.subTest(key=key):
                wrong = subprocess.run(args, env={**env, key: "wrong"}, capture_output=True, timeout=60)
                self.assertNotEqual(wrong.returncode, 0)

    def test_unsigned_bundle_and_wrong_upload_certificate_are_rejected(self):
        self.assertNotEqual(self.verify(self.unsigned).returncode, 0)
        self.assertNotEqual(self.verify(self.signed, "f" * 64).returncode, 0)

    def test_appended_unsigned_payload_is_rejected(self):
        file = self.directory / "appended.aab"
        shutil.copyfile(self.signed, file)
        with zipfile.ZipFile(file, "a") as archive:
            archive.writestr("base/assets/extra.bin", b"unsigned injected payload")
        self.assertNotEqual(self.verify(file).returncode, 0)

    def test_modified_signed_payload_is_rejected(self):
        file = self.directory / "tampered.aab"
        with zipfile.ZipFile(self.signed) as source, zipfile.ZipFile(file, "w") as destination:
            for entry in source.infolist():
                value = b"tampered" if entry.filename == "base/manifest/AndroidManifest.xml" else source.read(entry)
                destination.writestr(entry, value)
        self.assertNotEqual(self.verify(file).returncode, 0)
