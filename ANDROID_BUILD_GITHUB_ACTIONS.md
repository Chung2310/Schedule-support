# Android: GitHub Actions → Gradle → Google Play

Luồng Android chạy hoàn toàn trên GitHub Actions: sinh project native cục bộ, build AAB bằng Gradle, ký bằng upload keystore từ GitHub Secrets và upload trực tiếp qua Google Play API. Không dùng EAS CLI, EAS Build/Submit, tài khoản Expo hoặc `EXPO_TOKEN` cho Android.

App vẫn dùng Expo SDK 57. `Expo Prebuild` là công cụ cục bộ sinh project Android từ `app.json` và config plugins; Gradle sau đó biên dịch trên runner Ubuntu. Thư mục native được sinh tự động, không commit hay sửa tay. Luồng iOS hiện có được giữ nguyên.

Thông tin cụ thể đã tổng hợp từ dự án/chat BNI: [ANDROID_GITHUB_SETUP.md](ANDROID_GITHUB_SETUP.md). Phần upload dùng Google WIF/OIDC, cùng cách xác thực đã thiết lập cho BNI, với provider/quyền dành cho repo Schedule-support.

## Khi mới có tài khoản developer, chưa có bản upload

Google Play API/action upload chỉ cập nhật app đã có bản upload đầu tiên qua Play Console. Tài khoản developer mới chưa đủ để workflow tự tạo app, chấp nhận điều khoản hoặc hoàn tất hồ sơ store.

1. Dùng upload keystore BNI hiện có `C:\Users\tuna\AndroidSigning\igen-upload.jks`, alias `igen-upload`, và **4 secrets ký Android** trong bảng bên dưới. Dùng đúng mật khẩu keystore/private key đã thiết lập bên BNI.
2. Chạy **Actions → App CI and Production Android Release → Run workflow → production**, **bỏ chọn `upload_to_play`**. Chế độ này build, ký và kiểm tra AAB, lưu artifact, rồi bỏ qua job upload; chưa cần cấu hình WIF cho repo mới.
3. Tạo app iGen Check trong Play Console, cấu hình Play App Signing và hoàn thành các bước Google yêu cầu. Package hiện trong repository là **`com.company.ceovoicecalendar`**; xác định package trước lần upload đầu tiên vì package gắn với app sau đó không đổi được.
4. Tải `igencheck.aab` từ artifact của lần chạy, upload bản đầu tiên thủ công qua Console vào Internal testing. Hoàn thành hồ sơ/trạng thái release để app không còn bị chặn bởi yêu cầu draft/setup.
5. Dùng Google project/pool/Service Account của BNI, thêm provider và quyền WIF cho repo `Chung2310/Schedule-support`, rồi cấp Service Account quyền trên app calender trong Play Console. Điền hai Repository Variables `GOOGLE_WORKLOAD_IDENTITY_PROVIDER` và `GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL`. Sau khi app đã có upload đầu tiên và hoàn thành thiết lập, đặt Repository Variable `GOOGLE_PLAY_UPLOAD_ENABLED` thành **`true`**.
6. Khi Variable trên đã bật, các lần sau chạy với **`upload_to_play` được chọn** hoặc push/merge `production`: workflow tự upload vào Internal testing. Lần build mới có versionCode mới; không upload lại versionCode đã dùng.

Khi `GOOGLE_PLAY_UPLOAD_ENABLED` chưa đặt hoặc khác `true`, push và chạy thủ công đều chỉ build AAB; chưa yêu cầu hai biến WIF. Khi Variable đã bật, `upload_to_play` mặc định là **true** cho chạy thủ công và push `production` tự upload; vẫn có thể bỏ chọn input để chỉ build. Chế độ build-only luôn yêu cầu 4 secrets ký và commit hiện tại của production.

## Các bước tự động

1. Push `develop` hoặc PR vào `develop`/`production`: lint, TypeScript, tests, Expo Doctor và kiểm tra cấu hình.
2. Push/merge `production` hoặc Run workflow trên `production`: sau khi validate đạt, runner Ubuntu với Java 17 và Android SDK 36 chạy `npm run build:android`.
3. Kiểm tra sớm signing secrets, biến WIF khi bật upload và commit còn là HEAD của production. Script giải mã keystore vào thư mục tạm ngoài repository; JDK mở private key bằng cả hai mật khẩu, từ chối debug key/certificate hết hạn trước khi build. Sinh project từ template đi kèm phiên bản Expo đã khóa trong package-lock, rồi chạy `./gradlew :app:bundleRelease` với tối đa 2 worker.
4. Kiểm tra AAB có JavaScript bundle nhúng không rỗng (`base/assets/index.android.bundle`) để chạy độc lập. Kiểm tra AAB thật bằng bundletool **1.18.3** có SHA-256 cố định: cấu trúc bundle, package, versionCode/versionName, target SDK và không bật debuggable. JDK đọc toàn bộ payload để xác minh chữ ký và đúng upload certificate; chặn cả file unsigned bị chèn thêm. Chỉ khi đạt mới lưu `igencheck.aab` và `build-info.json` trong GitHub Artifacts trong 7 ngày. Keystore được xóa trong `finally` và một bước `always()` của workflow.
5. Khi bật upload, job upload tải đúng artifact ID của job build, kiểm tra dấu xác minh native, commit và SHA-256; kiểm tra lại production chưa đổi commit. Google auth action cố định ở commit `7c6bc770dae815cd3e89ee6cdf493a5fab2cc093` xác thực WIF ngay trước upload. File credentials tạm do action tạo được truyền cho `r0adkll/upload-google-play` cố định ở commit `e738b9dd8f2476ea806d921b64aacd24f34515a5`, dùng `tracks: internal`, trạng thái `completed`; file credentials được dọn khi job kết thúc.

Toàn bộ build/upload production được tuần tự hóa. Không còn workflow/script APK. Internal testing tương ứng bước phân phối bản thử qua TestFlight; phát hành công khai được quản lý trong Play Console.

GitHub chỉ giữ một lần chạy đang chờ trong concurrency group mặc định; một push mới có thể thay lần đang chờ. Nếu production tiến lên commit mới trong lúc build cũ chạy, lần cũ sẽ dừng trước upload và lần mới tiếp tục. Kiểm tra nhánh cần repository origin truy cập được bằng token read-only của `actions/checkout`.

## Chuẩn bị GitHub Secrets

Tạo Environment `google-play` trong repository Schedule-support, giống mẫu BNI. Đặt 4 secrets dưới Environment secrets; Repository Secrets cùng tên cũng được hỗ trợ khi không có giá trị ghi đè trong environment:

| Secret | Nội dung |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | Upload keystore Android mã hóa base64 |
| `ANDROID_KEYSTORE_PASSWORD` | Mật khẩu keystore |
| `ANDROID_KEY_ALIAS` | Alias upload key trong keystore |
| `ANDROID_KEY_PASSWORD` | Mật khẩu private key |

Nếu đã có app Android trên Play, dùng đúng upload key đã đăng ký. Nếu khóa trước đây lưu trên EAS, tải khóa hiện có và đưa vào GitHub Secrets; không tạo key khác tùy tiện. Chỉ làm thao tác này trên máy riêng, không đưa khóa hay mật khẩu vào chat/repository.

Để lấy base64 trên Windows PowerShell, thay đường dẫn bằng file keystore của bạn và sao chép kết quả vào secret:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes('C:\Users\tuna\AndroidSigning\igen-upload.jks')) | Set-Clipboard
```

Alias thực tế của file trên đã được đọc từ metadata JKS là `igen-upload`. Hai mật khẩu dùng lại giá trị BNI; chúng không thể đọc lại dưới dạng rõ từ GitHub Secrets. Google upload xác thực bằng WIF; không tạo/download service-account JSON private key. Không dùng biến `EXPO_PUBLIC_*` cho khóa hoặc mật khẩu.

## Google Play và lần phát hành đầu

- Tạo/chọn app trên [Play Console](https://play.google.com/console/), package **`com.company.ceovoicecalendar`**.
- Dùng Cloud project, Service Account và WIF pool đã có từ BNI. Thêm provider/quyền cho repo Schedule-support theo [bảng setup cụ thể](ANDROID_GITHUB_SETUP.md), rồi cấp Service Account quyền thích hợp trên app mới trong Play Console.
- Thiết lập Play App Signing/upload key, store listing, khai báo dữ liệu và các mục app content mà Console yêu cầu.
- Với app mới, upload/release đầu tiên được thực hiện trong Play Console trước khi tự động hóa bằng action/API. Dùng chế độ `upload_to_play: false` để lấy AAB đã ký từ artifact. App còn draft có thể bị từ chối khi gửi release `completed`; hoàn thành thiết lập/trạng thái release trên Console.
- Thêm tester/nhóm email ở Internal testing và dùng link tham gia do Google Play cung cấp.

## versionCode không phụ thuộc EAS

Script tính:

```text
versionCode = ANDROID_VERSION_CODE_BASE + GITHUB_RUN_NUMBER × 1000 + GITHUB_RUN_ATTEMPT
```

`ANDROID_VERSION_CODE_BASE` là GitHub Actions **Variable**, mặc định `0`. Ví dụ run 12, attempt 1 → `12001`; build lại run đó → `12002`; run 13 → `13001`. Không dùng lại versionCode đã upload.

Nếu app đã có versionCode lớn hơn, đặt BASE đủ lớn trước lần chạy đầu để kết quả vượt versionCode cao nhất trên Play. Khi thay workflow/reset bộ đếm, kiểm tra lại BASE. Giới hạn cuối là `2100000000`, attempt phải nhỏ hơn `1000`.

Variables công khai tùy chọn: `EXPO_PUBLIC_PRIVACY_POLICY_URL`, `EXPO_PUBLIC_TERMS_OF_SERVICE_URL`, `EXPO_PUBLIC_DATA_DELETION_URL`, `EXPO_PUBLIC_SUPPORT_URL`. URL tài liệu phải là HTTPS; support có thể là `mailto:`. Chúng được truyền trực tiếp vào quá trình bundle trên runner.

## Chạy và xử lý lỗi

- Kiểm tra local: `npm run android:check` (không build/upload hoặc yêu cầu secrets).
- Chạy release: **Actions → App CI and Production Android Release → Run workflow → production**, hoặc merge vào production.
- Nếu chỉ upload lỗi và production vẫn ở đúng commit, sửa quyền/secret/setup rồi **Re-run failed jobs** để dùng lại đúng AAB trong thời hạn artifact. Nếu production đã đổi commit, chạy release mới thay vì gửi bản cũ.
- Nếu lần trước có thể đã upload/commit xong nhưng mất kết nối, kiểm tra Play Console trước khi gửi lại. Upload Google Play không được retry mù: versionCode đã được nhận không thể upload lại; một release mới dùng versionCode mới. Cũng không rerun build của run cũ sau khi đã phát hành run mới hơn, vì công thức versionCode dựa trên run number.
- Build mới dùng run attempt mới khi rerun toàn bộ. Thông tin commit/versionCode/SHA-256 nằm trong artifact và Summary.
- Lỗi ký: kiểm tra keystore, alias, mật khẩu và upload key đã đăng ký với Play.
- Lỗi quyền hoặc app không tìm thấy: kiểm tra package, API, quyền Service Account và các mục thiết lập của app.
- Lỗi WIF: kiểm tra provider cho đúng repo/nhánh, mapping, binding `roles/iam.workloadIdentityUser` và hai Repository Variables. Quyền `id-token: write` chỉ được cấp ở job upload, không cấp cho validation/PR hoặc build.
- Upload thành công chưa bảo đảm Google đã xử lý xong hoặc tester đã nhận bản mới; kiểm tra Play Console.

Expo Doctor được cố định ở **1.21.6**. Gate vẫn kiểm tra mức tương thích SDK và có thể yêu cầu cập nhật patch khi Expo thay khuyến nghị; không bỏ qua lỗi Doctor để phát hành. Validation cũng chạy các regression test chữ ký JAR thật bằng Java 17.

Checksum xác nhận file upload khớp AAB đã qua kiểm tra native. Các test local và AAB thử không thay thế việc biên dịch toàn bộ ứng dụng bằng Android SDK/NDK trên runner GitHub, cũng không chứng minh quyền upload của Service Account hoặc cấu hình app trên Google Play. Lần chạy thực tế đầu tiên cần xác nhận cả job build, job upload và trạng thái xử lý trong Play Console.

Tham khảo: [Expo CNG](https://docs.expo.dev/workflow/continuous-native-generation/), [Android command-line build](https://developer.android.com/build/building-cmdline), [upload-google-play action](https://github.com/r0adkll/upload-google-play), [Google Play API setup](https://developers.google.com/android-publisher/getting_started), [GitHub Secrets](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets).

Yêu cầu upload đầu tiên qua Console: [Google Play Publishing API — Edits](https://developers.google.com/android-publisher/edits).
