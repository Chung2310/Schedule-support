# Setup Android calender từ cấu hình BNI đã dùng

Đối chiếu ngày 05/11/2026 từ chat **Check BNI mobile app and backend**, workflow và tài liệu BNI Mobile. Trong lịch sử chat, iGen Connect `com.igen.connect`, bản `1.0.0 (301)` đã qua internal testing và bạn đã bắt đầu gửi Production. Đây là trạng thái ghi nhận trong chat, không phải kiểm tra trực tiếp trạng thái duyệt hiện tại trên Play Console.

BNI dùng **WIF/OIDC** để Google Play upload vì Google Cloud organization chặn tạo service-account JSON key. Calender đã được chuyển sang cách này; không cần secret `GOOGLE_PLAY_SERVICE_ACCOUNT_JSON`.

## 1. Những gì dùng lại từ BNI

| Mục | Giá trị đã tìm được |
| --- | --- |
| File upload keystore trên máy | `C:\Users\tuna\AndroidSigning\igen-upload.jks` |
| Alias thực tế đọc từ metadata JKS | `igen-upload` |
| Mật khẩu keystore/private key | Dùng lại giá trị đã thiết lập cho BNI; không ghi mật khẩu vào tài liệu |
| Google Cloud project ID trong chat | `project-3f31facf-7a10-4984-bbb` |
| Google Cloud project number | `147431615644` |
| WIF pool đã có | `github-actions` |
| Service Account đã dùng cho Play | `github-play-upload@project-3f31facf-7a10-4984-bbb.iam.gserviceaccount.com` |
| Environment GitHub theo mẫu BNI | `google-play` |

Thông tin Cloud lấy từ lịch sử chat BNI; kiểm tra lại đúng project/service account khi mở Console. Mật khẩu và nội dung private key không được đọc/in ra trong lần tổng hợp này.

## 2. GitHub: 4 Secrets ký Android

Vào repo **Chung2310/Schedule-support → Settings → Environments → New environment → `google-play`**. Cả job build và upload hiện khai báo environment này.

Thêm dưới **Environment secrets**:

| Tên Secret | Giá trị cần nhập |
| --- | --- |
| `ANDROID_KEYSTORE_BASE64` | Base64 của file `igen-upload.jks` phía trên |
| `ANDROID_KEYSTORE_PASSWORD` | Mật khẩu keystore đã dùng bên BNI |
| `ANDROID_KEY_ALIAS` | `igen-upload` |
| `ANDROID_KEY_PASSWORD` | Mật khẩu private key đã dùng bên BNI |

Convert và copy Base64 vào clipboard trên PowerShell:

```powershell
[Convert]::ToBase64String(
  [IO.File]::ReadAllBytes('C:\Users\tuna\AndroidSigning\igen-upload.jks')
) | Set-Clipboard
```

Repository Secrets cùng tên cũng dùng được nếu Environment không có giá trị ghi đè. Secrets ở repo BNI không tự chia sẻ sang repo Schedule-support; dùng lại giá trị từ kho bí mật/bản sao bạn đã giữ. Giữ file JKS và mật khẩu để ký các bản cập nhật sau.

## 3. GitHub: Repository Variables

Vào **Settings → Secrets and variables → Actions → Variables** của repo Schedule-support.

| Variable | Giá trị |
| --- | --- |
| `GOOGLE_PLAY_SERVICE_ACCOUNT_EMAIL` | `github-play-upload@project-3f31facf-7a10-4984-bbb.iam.gserviceaccount.com` |
| `GOOGLE_WORKLOAD_IDENTITY_PROVIDER` | `projects/147431615644/locations/global/workloadIdentityPools/github-actions/providers/schedule-production` — provider mới cần tạo ở bước 4 |
| `GOOGLE_PLAY_UPLOAD_ENABLED` | `false` trong lúc chuẩn bị app; đổi `true` khi provider, IAM, Play Console và upload đầu tiên của calender đã sẵn sàng |
| `ANDROID_VERSION_CODE_BASE` | `0` hoặc để trống cho app mới |

Hai biến WIF là thông tin định danh, không phải private key. Đặt ở **Repository Variables** để phù hợp các biểu thức workflow. Riêng `GOOGLE_PLAY_UPLOAD_ENABLED` phải ở cấp repository vì nó quyết định job có chạy trước khi vào environment.

Variables URL tùy chọn cho app này:

- `EXPO_PUBLIC_PRIVACY_POLICY_URL`: URL HTTPS trang privacy của iGen Check.
- `EXPO_PUBLIC_TERMS_OF_SERVICE_URL`: URL HTTPS điều khoản của iGen Check.
- `EXPO_PUBLIC_DATA_DELETION_URL`: URL HTTPS hướng dẫn xóa dữ liệu của iGen Check.
- `EXPO_PUBLIC_SUPPORT_URL`: URL HTTPS hoặc `mailto:` cho hỗ trợ iGen Check.

`EXPO_PUBLIC_API_URL`, Firebase `ANDROID_GOOGLE_SERVICES_JSON` và các biến backend của BNI phục vụ app BNI. Calender hiện lưu lịch trên thiết bị, không tham chiếu những cấu hình đó.

## 4. Google Cloud: cho repo calender dùng WIF hiện có

Provider BNI được cấu hình cho repo `Chung2310/BNI-ERP-Mobile` và nhánh `production` trong lịch sử chat. Repo mới cần được cấp quyền riêng. Dùng lại project, pool và Service Account ở mục 1; tạo provider **`schedule-production`** trong pool `github-actions` để giữ luồng BNI đang hoạt động.

Thông số provider mới:

```text
Provider type: OpenID Connect (OIDC)
Provider ID: schedule-production
Issuer URL: https://token.actions.githubusercontent.com/
Audience: Default
```

Attribute mappings:

```text
google.subject = assertion.sub
attribute.repository = assertion.repository
attribute.ref = assertion.ref
```

Attribute condition:

```text
assertion.repository == 'Chung2310/Schedule-support' && assertion.ref == 'refs/heads/production'
```

Trên Service Account đang dùng, thêm binding **Workload Identity User** (`roles/iam.workloadIdentityUser`) cho principal:

```text
principalSet://iam.googleapis.com/projects/147431615644/locations/global/workloadIdentityPools/github-actions/attribute.repository/Chung2310/Schedule-support
```

Đây là provider và binding mới cần bạn cấu hình; việc tổng hợp/cập nhật code chưa tạo chúng trên Google Cloud. Nếu Console đang dùng tên provider khác, điền resource name thực tế của provider đó vào `GOOGLE_WORKLOAD_IDENTITY_PROVIDER`, đồng thời bảo đảm điều kiện cho phép đúng repo/nhánh trên.

## 5. Google Play: app riêng của calender

Dùng tài khoản Google Play hiện có đã dùng cho BNI. Tạo app iGen Check với package hiện tại **`com.company.ceovoicecalendar`**, hoàn thành Play App Signing và setup theo Console. Cấp Service Account ở mục 1 quyền xem/phát hành thử nghiệm cho app này; quyền trên iGen Connect không tự chứng minh quyền trên app mới.

Lần đầu, giữ `GOOGLE_PLAY_UPLOAD_ENABLED=false`, chạy workflow trên `production` để lấy AAB, upload qua Play Console vào Internal testing. BNI đã có release riêng; calender là package khác nên vẫn cần upload đầu tiên của chính app này. VersionCode `301` của BNI không quyết định versionCode cho calender.

Sau khi app đã nhận AAB đầu tiên, WIF/IAM/quyền Play đã đủ và app hết các chặn setup/draft, đặt `GOOGLE_PLAY_UPLOAD_ENABLED=true`. Push/merge production hoặc chạy manual với `upload_to_play` bật sẽ build AAB và tự upload Internal testing. Phát hành công khai tiếp tục được quản lý trong Play Console.

Workflow cấp OIDC token chỉ cho job upload; auth chạy sau khi tải/kiểm tra AAB, ngay trước upload. File credentials ngắn hạn do Google auth action tạo được dọn tự động. Không tải JSON key dài hạn hay đưa credentials vào AAB.

Tài liệu kỹ thuật: [Google WIF cho GitHub Actions](https://github.com/google-github-actions/auth), [WIF deployment pipelines](https://docs.cloud.google.com/iam/docs/workload-identity-federation-with-deployment-pipelines), [Google Play API setup](https://developers.google.com/android-publisher/getting_started), [quy trình build chi tiết](ANDROID_BUILD_GITHUB_ACTIONS.md).
