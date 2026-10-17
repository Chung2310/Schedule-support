# Build IPA production trên GitHub macOS và upload tự động lên Apple

Cập nhật: **17/10/2026**. Dự án: **iGen Check — Expo SDK 57**.

> Bản có widget cần chuẩn bị thêm App Group và provisioning profile của extension **trước lần build production đầu tiên**. Xem [Widget iOS](#widget-ios).

## 1. Cách build đã triển khai trong repo

Workflow [ios-production.yml](.github/workflows/ios-production.yml) dùng runner **macos-26**, **Xcode 26.6**, Node.js 22 và EAS CLI với `--local`.

```text
Push/merge production từ Windows
    ↓
CI trên Ubuntu: kiểm tra code, dependencies và cấu hình
    ↓
Runner macOS: kiểm tra project và công cụ
    ↓
Lấy credentials đã lưu trên EAS
    ↓
Xcode biên dịch và ký IPA ngay trên GitHub
    ↓
Kiểm tra nội dung IPA, provisioning profile và chữ ký
    ↓
Lưu IPA + build-info.json vào Artifacts trong 7 ngày
    ↓
Job Ubuntu tải đúng artifact ID, đối chiếu commit và SHA-256
    ↓
EAS Submit upload IPA lên App Store Connect và chờ hoàn tất
```

Đầu ra là **IPA đã ký và được upload lên App Store Connect**. Apple tiếp tục xử lý binary trước khi bản build xuất hiện trong TestFlight.

`--local` chọn máy đang thực thi lệnh, tức runner macOS của GitHub. EAS CLI điều phối build và truy cập credentials; không tạo job EAS Cloud Build. Bạn tiếp tục làm việc trên Windows. Xem [EAS local builds](https://docs.expo.dev/build-reference/local-builds/).

## 2. Chỉ nhánh production được build

| Sự kiện | CI | Build IPA |
| --- | --- | --- |
| Push develop | Có | Không |
| PR vào develop/production | Có | Không |
| Push hoặc merge production | Có | Có, sau khi CI đạt |
| Chạy thủ công trên production | Có | Có, sau khi CI đạt |
| Chạy thủ công trên nhánh khác | Có | Không |

Workflow kiểm tra ref `refs/heads/production` và sự kiện `push`/`workflow_dispatch` cho cả build và upload. Script build kiểm tra lại ref, sự kiện, hệ điều hành và môi trường GitHub Actions; script submit kiểm tra production và chỉ upload IPA từ đúng commit của lần chạy.

Các job production dùng chung concurrency group và không hủy build đang chạy. GitHub có thể thay thế lần đang chờ bằng lần mới hơn theo cơ chế concurrency của Actions.

## 3. Cần setup gì trên GitHub?

### Secret bắt buộc

Vào **Repository → Settings → Secrets and variables → Actions → Secrets**:

| Secret | Tác dụng |
| --- | --- |
| `EXPO_TOKEN` | Truy cập project `@igen-technology/schedule` và credentials build đã lưu |
| `ASC_APP_ID` (tùy chọn) | Nếu đã đặt, phải là `6823442026`; mặc định lấy app ID cố định trong `eas.json` |

Token cần còn hiệu lực và có quyền trên đúng organization. Không đặt token vào biến `EXPO_PUBLIC_*`, mã nguồn hoặc tài liệu.

### Variables công khai, nếu sử dụng

| Variable | Giá trị |
| --- | --- |
| `EXPO_PUBLIC_PRIVACY_POLICY_URL` | URL HTTPS của trang privacy |
| `EXPO_PUBLIC_SUPPORT_URL` | URL HTTPS hoặc `mailto:` của địa chỉ hỗ trợ |

Script kiểm tra URL và truyền vào môi trường build. Giá trị secret Expo không được ghi vào `eas.json`.

### Cài đặt Actions

- Actions được bật trong **Settings → Actions → General**.
- Cho phép `actions/checkout`, `actions/setup-node`, `actions/upload-artifact`.
- Quyền `contents: read` đáp ứng luồng hiện tại.
- Không phải thêm self-hosted runner; GitHub cấp runner theo `runs-on`.
- Để có nút **Run workflow**, file workflow với `workflow_dispatch` cần hiện diện trên nhánh mặc định. Khi chạy chọn **production**.

Nguồn: [Actions settings](https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/managing-github-actions-settings-for-a-repository), [manual workflow](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/manually-run-a-workflow).

## 4. Credentials ký app

Cần Apple Distribution Certificate **kèm private key** và App Store provisioning profile còn hợp lệ, đã lưu trên EAS cho đúng project.

| Thông tin | Giá trị phải khớp |
| --- | --- |
| Owner/slug | `igen-technology/schedule` |
| EAS project ID | `6b866bf1-af89-481f-840e-c2779ec6c5fb` |
| Bundle ID | `com.igen.schedule` |
| Apple Team | `VP77TD9A77` |
| Tên hiển thị | `iGen Check` |

Có thể kiểm tra từ Windows sau khi đăng nhập Expo đúng tài khoản/token:

```powershell
npx eas-cli@latest project:info
npx eas-cli@latest credentials --platform ios
```

Các lệnh quản lý credentials không tạo build. Profile `com.igen.3s` không phù hợp ứng dụng này. Khi credentials thiếu hoặc hết hạn, sửa trong trình quản lý rồi chạy lại workflow.

Build sử dụng `--freeze-credentials` để không tự thay credentials trong CI. Upload tự động dùng API key App Store Connect đã gán cho app trên EAS. Nếu chưa có key, mở `eas credentials --platform ios`, chọn production và thiết lập API key cho EAS Submit trước khi chạy. Token Expo và app ID không thay thế API key Apple.

App đích được cố định là **iGen Check**, Apple ID **6823442026**. CI từ chối app ID khác.

Nguồn: [app credentials](https://docs.expo.dev/app-signing/app-credentials/), [EAS CLI](https://docs.expo.dev/eas/cli/).

## 5. Lệnh build thực tế

Trong job macOS, workflow chạy:

```bash
npm run build:ios
```

Script [build-ios.cjs](scripts/build-ios.cjs) cố định các tham số:

```bash
npx --yes eas-cli@latest build \
  --platform ios \
  --profile production \
  --local \
  --non-interactive \
  --freeze-credentials \
  --output "$RUNNER_TEMP/ios-artifacts/igencheck.ipa"
```

`npm run build:ios` trên máy cá nhân hoặc nhánh khác dừng với hướng dẫn chạy GitHub Actions. Đây là lệnh dành cho runner production.

Các script iOS cloud cũ `build:ios:test`, `build:ios:preview`, `build:ios:simulator`, `deploy:ios` đã được gỡ để mọi đường build iOS được cung cấp đi qua cùng điều kiện production.

Profile production trong [eas.json](eas.json) đặt `distribution: store`, `ios.simulator: false`, `ios.credentialsSource: remote`, `autoIncrement: true`. Số build được quản lý remote; nơi quản lý số build độc lập với nơi biên dịch. Mỗi lần tạo binary mới có thể tăng số, kể cả khi lần trước thất bại sau bước tăng số.

Nguồn: [eas.json](https://docs.expo.dev/eas/json/), [build versions](https://docs.expo.dev/build-reference/app-versions/).

## 6. Chạy và tải kết quả

1. Commit toàn bộ thay đổi workflow, scripts, tests, cấu hình và tài liệu.
2. Push develop và chờ CI đạt.
3. Merge vào production.
4. Vào **Actions → App CI and Production iOS Release → lần chạy tương ứng**.
5. Theo dõi job **Build production IPA on GitHub macOS**.
6. Khi thành công, mở **Artifacts** và tải `igencheck-ios-<run-id>-<attempt>`.
7. Giải nén để lấy `igencheck.ipa` và `build-info.json`.
8. Theo dõi job **Upload validated production IPA to App Store Connect**. Job này tự chạy sau build và artifact thành công.
9. Khi upload hoàn tất, mở [TestFlight của iGen Check](https://appstoreconnect.apple.com/apps/6823442026/testflight) và theo dõi Apple xử lý. Nếu Apple gửi email lỗi `ITMS-...`, cần xử lý lỗi đó; trạng thái upload thành công chưa chứng minh binary đã qua xử lý.

`build-info.json` và phần Summary của lần chạy ghi version, build number, commit, Bundle ID, Apple Team, phiên bản Xcode và SHA-256 của file IPA.

Xem [tải workflow artifact](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/download-workflow-artifacts).

### Upload thất bại thì chạy lại thế nào?

Job `submit-ios` chạy riêng trên Ubuntu và tải artifact bằng ID do `build-ios` trả về. Nếu chỉ job submit thất bại, chọn **Re-run failed jobs** để gửi lại IPA đã tạo trong thời hạn lưu artifact. Chạy lại toàn bộ workflow sẽ build một IPA mới.

Trước khi gửi lại, kiểm tra Apple đã nhận binary hay chưa nếu lỗi xảy ra sau upload hoặc job hết thời gian chờ. Không dùng `--latest` để chọn IPA cloud cũ.

Script [submit-ios.cjs](scripts/submit-ios.cjs) gọi `eas submit --path ... --non-interactive --wait`; không gọi build. Cách này không dùng thêm lượt EAS Cloud Build. Xem [submit trong CI](https://docs.expo.dev/submit/ios/#use-other-cicd-services).

## 7. IPA được kiểm tra những gì?

[check-ios-artifact.py](scripts/check-ios-artifact.py) kiểm tra:

- IPA giải nén được và chứa đúng một app chính.
- Bundle ID, tên hiển thị, version/build number và nền tảng iPhoneOS.
- Mô tả quyền micro, nhận diện giọng nói, thư viện ảnh.
- Privacy manifests đọc được.
- Profile đúng app, team, còn hạn và dùng phân phối App Store.
- Chữ ký app bằng `codesign --verify --deep --strict`.
- Entitlements đã ký khớp app/team, không cho phép debug.

Chỉ sau khi kiểm tra đạt, workflow mới lưu IPA và thông tin build thành artifact. Script không tự chứng minh Apple sẽ chấp nhận mọi nội dung binary; kết quả ở đây xác nhận các thuộc tính đã kiểm tra.

## 8. Xử lý lỗi build

| Lỗi | Việc cần kiểm tra |
| --- | --- |
| Bị chặn nhánh/môi trường | Chạy workflow trên production; không chạy lệnh build trên Windows |
| Token invalid hoặc thiếu quyền | Thay GitHub Secret `EXPO_TOKEN`, kiểm tra quyền organization |
| Credentials thiếu/hết hạn | Dùng `eas credentials --platform ios` và chọn đúng production/project |
| `Input is required ... Apple Team ID` | Workflow đã khai báo `EXPO_APPLE_TEAM_ID=VP77TD9A77` và `EXPO_APPLE_TEAM_TYPE=COMPANY_OR_ORGANIZATION`; dùng commit mới. Lỗi hỏi thông tin team chưa chứng minh API key bị hỏng |
| `ExpoWidgetsTarget ... Credentials are not set up` | Chuẩn bị profile riêng cho `com.igen.schedule.widgets` và App Group theo mục Widget iOS; chạy lại workflow sau khi lưu credentials lên EAS |
| Không tìm thấy Xcode 26.6 | Kiểm tra phần mềm runner; cập nhật `DEVELOPER_DIR` tới Xcode tương thích SDK 57 |
| Thiếu CocoaPods/fastlane | Đọc bước Check macOS build tools và chuẩn bị công cụ trên runner |
| Native compile thất bại | Đọc log bước Build signed production IPA locally |
| IPA kiểm tra thất bại | Đọc lỗi Bundle ID/profile/privacy/chữ ký ở bước Validate signed IPA |
| Không có artifact | Kiểm tra build và validation đều thành công; file được giữ 7 ngày |
| Upload thiếu API key | Gán API key App Store Connect cho app trên EAS qua trình quản lý credentials |
| Sai ASC_APP_ID | Đổi GitHub Secret về `6823442026` hoặc dùng giá trị mặc định trong `eas.json` |
| IPA sai commit hoặc SHA-256 | Dừng upload và kiểm tra artifact của job build tương ứng |
| Upload thành công nhưng TestFlight chưa có build | Kiểm tra đúng app, trạng thái xử lý của Apple và email lỗi binary |

SDK 57 hiện yêu cầu Xcode 26.4+; workflow chọn cụ thể 26.6 đang được liệt kê trên runner, cùng phiên bản Xcode của IPA cloud đã đối chiếu trước đây. Các trường chọn phần mềm trong `eas.json` không tự thiết lập môi trường local runner.

Nguồn: [SDK 57](https://docs.expo.dev/versions/v57.0.0/), [local build limitations](https://docs.expo.dev/build-reference/local-builds/#limitations), [runner software](https://github.com/actions/runner-images/blob/main/images/macos/macos-26-arm64-Readme.md).

## 9. Chi phí và trạng thái xác nhận

Runner tiêu chuẩn cho repo public miễn phí theo chính sách GitHub hiện hành. Repo private dùng hạn mức Actions; artifact có hạn mức lưu trữ riêng. Xem [Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions).

Workflow và scripts đã được sửa trong repo. Các kiểm tra mã nguồn chạy được trên Windows; biên dịch Xcode và kiểm tra chữ ký thực tế phải được xác nhận ở lần chạy production trên GitHub macOS. Không có cloud build nào được khởi tạo trong quá trình chỉnh sửa local.

<a id="widget-ios"></a>

## 10. Widget iOS — Lịch hôm nay

### Phạm vi đã cấu hình

- Màn hình chính: nhỏ (lịch kế tiếp), vừa (tối đa 2 lịch), lớn (tối đa 6 lịch).
- Màn hình khóa: ô chữ nhật và dòng chữ phía trên đồng hồ, hiển thị lịch kế tiếp trong ngày.
- Lịch đã qua giờ được làm nhạt trên bản danh sách. Bấm “Đã nhớ” chỉ dừng nhắc, không xóa lịch khỏi widget.
- Nội dung lấy từ lịch lưu cục bộ. Không cần server, APNs hay API key riêng cho widget.
- Android chưa có widget trong lần triển khai này; plugin Android được tắt rõ ràng.

Widget dùng `expo-widgets` và giao diện SwiftUI từ `@expo/ui`, đúng SDK 57. Plugin sinh extension khi prebuild; không sửa thư mục `ios/` bằng tay. Đây là extension native, nên cần **IPA mới**; bản TestFlight cũ và Expo Go không có widget.

### Chuẩn bị quyền ký một lần trước khi merge production

| Thành phần | Giá trị |
| --- | --- |
| App chính | `com.igen.schedule` |
| Widget extension | `com.igen.schedule.widgets` |
| Tên target extension | `ExpoWidgetsTarget` |
| App Group dùng chung | `group.com.igen.schedule` |
| Apple Team | `VP77TD9A77` — IGEN TECHNOLOGY |

1. Mở Apple Developer → **Certificates, Identifiers & Profiles**, chọn đúng team IGEN TECHNOLOGY.
2. Trong **Identifiers**, đăng ký App Group `group.com.igen.schedule` nếu chưa có.
3. Chọn App ID `com.igen.schedule`, bật **App Groups**, chọn group trên rồi lưu.
4. Đăng ký App ID kiểu Explicit `com.igen.schedule.widgets`, bật **App Groups** và chọn cùng group.
5. Tạo lại **App Store distribution provisioning profile cho app chính** sau khi bật App Groups. Tạo profile riêng cho widget extension. Dùng Apple Distribution Certificate còn hạn của team hiện tại; không cần tạo certificate mới nếu đã có private key trên EAS.
6. Lưu cả hai profile vào credentials của project `@igen-technology/schedule` trên EAS. Có thể thực hiện từ Windows bằng lệnh dưới và đăng nhập Apple khi được hỏi. Nếu CLI hỏi chọn target, xử lý cả app chính và `ExpoWidgetsTarget`:

   ```powershell
   $env:EXPO_APPLE_TEAM_ID = "VP77TD9A77"
   $env:EXPO_APPLE_TEAM_TYPE = "COMPANY_OR_ORGANIZATION"
   npx eas-cli@latest credentials:configure-build --platform ios --profile production
   ```

   Nếu CLI vẫn giữ profile cũ, mở trình quản lý credentials để thay provisioning profile đúng target, hoặc upload profile đã tạo trên Apple Developer:

   ```powershell
   npx eas-cli@latest credentials --platform ios
   ```

   Mỗi profile phải có entitlement `com.apple.security.application-groups` chứa `group.com.igen.schedule`. Không dùng profile `com.igen.3s` hoặc profile của app chính cho extension.

   Nếu CLI hỏi Apple login, đăng nhập tài khoản có quyền trên team **IGEN TECHNOLOGY**, hoàn tất 2FA. Chọn certificate Distribution hiện có khi còn hợp lệ; đồng ý tạo/cập nhật provisioning profile cho từng target. Kết thúc phải có credentials đầy đủ cho **cả `iGenCheck` và `ExpoWidgetsTarget`**. Sau đó push các sửa đổi cấu hình lên `production`, hoặc chạy lại workflow nếu cấu hình mới đã có trên `production`.

`app.json` đã khai báo `ios.appleTeamId` cho các native target. Workflow cũng truyền `EXPO_APPLE_TEAM_ID` và `EXPO_APPLE_TEAM_TYPE` cho bước build/upload để EAS CLI không hỏi team khi API key đã lưu thiếu metadata team. Đây là thông tin công khai đã ghi trong workflow, không cần thêm GitHub Secret. Nếu sau đó Apple báo key bị thu hồi hoặc không đủ quyền thì mới kiểm tra API key trong trình quản lý credentials; không suy ra key hỏng chỉ từ lỗi không đọc được stdin.

Lệnh quản lý credentials không khởi tạo Cloud Build và không dùng lượt EAS Cloud Build. Expo token xác thực tài khoản Expo; thao tác cấp App Group cần quyền Apple Developer của team. Không tạo app mới trên App Store Connect cho extension; vẫn upload vào app ID `6823442026`.

**GitHub không cần thêm secret hay variable cho widget.** Workflow vẫn chỉ build IPA trên `production` bằng GitHub macOS, dùng credentials remote. Vì build có `--non-interactive --freeze-credentials`, CI không thể tự đăng nhập Apple hoặc tạo profile mới. Hoàn tất các bước ký trên trước khi chạy release đầu tiên có widget.

Trước khi upload, script kiểm tra IPA bắt buộc phải có extension widget nhúng trong app, đúng bundle ID, cùng version/build với app chính, đúng Apple Team, App Group trong cả chữ ký lẫn hai provisioning profile. Nếu thiếu, job dừng trước upload. `build-info.json` và summary của Actions có thêm mục widget khi đạt.

### Cập nhật dữ liệu và chuyển ngày

App gửi timeline sang App Group khi đọc dữ liệu, thêm, sửa hoặc xóa lịch; khi trở lại app sẽ đọc lại lịch và gửi lại timeline. Khi ngày hoặc múi giờ thay đổi, app cũng tạo lại timeline. Hướng dẫn thêm widget nằm trong **Cài đặt → Tùy chọn thêm → Cách thêm widget**.

Timeline có mốc cho ngày chứa lịch, sau phút bắt đầu mỗi lịch và nửa đêm tiếp theo. Các ngày có lịch tương lai đã lưu được chuẩn bị trước, không cần app chạy nền liên tục. Ngày không có lịch hiển thị trạng thái trống; entry cuối không giữ ngày tháng cố định để tránh hiển thị ngày cũ mãi mãi. Widget không lấy lịch của ngày người dùng đang chọn trong app, mà lấy ngày hiện tại trên thiết bị lúc đồng bộ.

iOS quản lý thời điểm render và giới hạn tần suất làm mới; không cam kết cập nhật đúng từng giây tại nửa đêm hoặc ngay sau khi lưu. Khi đổi múi giờ, mở lại app để tạo timeline theo múi giờ mới. Nội dung có `privacySensitive` để iOS có thể che khi áp dụng chế độ bảo vệ nội dung, nhưng việc thêm widget vẫn có thể làm lộ tên lịch trên màn hình khóa theo cài đặt thiết bị.

### Sau khi có bản TestFlight mới

1. Mở app một lần để lịch và giao diện widget được ghi vào vùng dùng chung.
2. Màn hình chính: nhấn giữ chỗ trống → Sửa/Thêm tiện ích → **iGen Check → Lịch hôm nay** → chọn kích thước.
3. Màn hình khóa: nhấn giữ → Tùy chỉnh → Màn hình khóa → thêm widget iGen Check vào vùng phù hợp.
4. Có thể đối chiếu lịch hôm nay, thêm/sửa/xóa lịch, ngày không có lịch, đổi ngày và chế độ sáng/tối trên iPhone thực tế. Từ Windows chỉ xác nhận được mã nguồn và cấu hình; cần lần build macOS để xác nhận extension biên dịch, ký và được nhúng vào IPA.

Nguồn: [Expo Widgets SDK 57](https://docs.expo.dev/versions/v57.0.0/sdk/widgets/), [iOS App Extensions](https://docs.expo.dev/build-reference/app-extensions/), [iOS capabilities](https://docs.expo.dev/build-reference/ios-capabilities/), [lệnh quản lý credentials](https://docs.expo.dev/eas/cli/#eas-credentialsconfigure-build).
