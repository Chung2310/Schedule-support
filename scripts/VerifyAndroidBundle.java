import java.io.OutputStream;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.KeyStore;
import java.security.PrivateKey;
import java.security.cert.X509Certificate;
import java.util.HashSet;
import java.util.HexFormat;
import java.util.jar.JarFile;

/** Verify every payload entry, including appended entries that jarsigner only warns about. */
class VerifyAndroidBundle {
    private static String fingerprint(X509Certificate certificate) throws Exception {
        certificate.checkValidity();
        return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(certificate.getEncoded()));
    }

    public static void main(String[] args) throws Exception {
        if (args.length == 2 && args[0].equals("--keystore")) {
            var storePassword = System.getenv("ANDROID_KEYSTORE_PASSWORD");
            var keyPassword = System.getenv("ANDROID_KEY_PASSWORD");
            var alias = System.getenv("ANDROID_KEY_ALIAS");
            if (storePassword == null || keyPassword == null || alias == null) throw new IllegalArgumentException("Signing inputs missing");
            var store = KeyStore.getInstance(Path.of(args[1]).toFile(), storePassword.toCharArray());
            if (!(store.getKey(alias, keyPassword.toCharArray()) instanceof PrivateKey)) {
                throw new SecurityException("The upload alias must contain a private key");
            }
            var certificate = (X509Certificate) store.getCertificate(alias);
            if (certificate.getSubjectX500Principal().getName().matches("(?i).*CN=Android Debug(?:,.*)?")) {
                throw new SecurityException("Debug signing keys cannot be used for a store release");
            }
            System.out.println(fingerprint(certificate));
            return;
        }
        if (args.length != 2 || !args[1].matches("[a-f0-9]{64}")) {
            throw new IllegalArgumentException("Expected AAB path and upload certificate SHA-256");
        }
        int payloads = 0;
        var seen = new HashSet<String>();
        try (var jar = new JarFile(Path.of(args[0]).toFile(), true)) {
            var entries = jar.entries();
            while (entries.hasMoreElements()) {
                var entry = entries.nextElement();
                var name = entry.getName();
                if (!seen.add(name)) throw new SecurityException("Duplicate bundle entry");
                if (entry.isDirectory()) continue;
                // Reading to EOF causes JarFile to validate the signed entry digest.
                try (var input = jar.getInputStream(entry)) {
                    input.transferTo(OutputStream.nullOutputStream());
                }
                var upper = name.toUpperCase(java.util.Locale.ROOT);
                if (upper.equals("META-INF/MANIFEST.MF") ||
                    upper.matches("META-INF/[^/]+\\.(SF|RSA|DSA|EC)") ||
                    upper.matches("META-INF/SIG-[^/]+")) continue;
                var signers = entry.getCodeSigners();
                if (signers == null || signers.length != 1) throw new SecurityException("Unsigned or ambiguous bundle signer");
                var leaf = (X509Certificate) signers[0].getSignerCertPath().getCertificates().get(0);
                if (!fingerprint(leaf).equals(args[1])) throw new SecurityException("Bundle signer does not match the upload certificate");
                payloads++;
            }
        }
        if (payloads == 0) throw new SecurityException("Bundle has no signed payload");
        System.out.println("All " + payloads + " payload entries are signed by the expected upload certificate.");
    }
}
