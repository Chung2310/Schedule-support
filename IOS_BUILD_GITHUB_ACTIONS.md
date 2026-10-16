# Build IPA production trên GitHub macOS

Cập nhật: **16/10/2026**. Dự án: **Schedule Support — Expo SDK 57**.

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
```

Đầu ra là **IPA đã ký để phân phối App Store**. Workflow kết thúc sau khi lưu artifact.

`--local` chọn máy đang thực thi lệnh, tức runner macOS của GitHub. EAS CLI điều phối build và truy cập credentials; không tạo job EAS Cloud Build. Bạn tiếp tục làm việc trên Windows. Xem [EAS local builds](https://docs.expo.dev/build-reference/local-builds/).

## 2. Chỉ nhánh production được build

| Sự kiện | CI | Build IPA |
| --- | --- | --- |
| Push develop | Có | Không |
| PR vào develop/production | Có | Không |
| Push hoặc merge production | Có | Có, sau khi CI đạt |
| Chạy thủ công trên production | Có | Có, sau khi CI đạt |
| Chạy thủ công trên nhánh khác | Có | Không |

Workflow kiểm tra ref `refs/heads/production` và sự kiện `push`/`workflow_dispatch`. Script build cũng kiểm tra lại ref, sự kiện, hệ điều hành và môi trường GitHub Actions trước khi thực thi EAS.

Các job production dùng chung concurrency group và không hủy build đang chạy. GitHub có thể thay thế lần đang chờ bằng lần mới hơn theo cơ chế concurrency của Actions.

## 3. Cần setup gì trên GitHub?

### Secret bắt buộc

Vào **Repository → Settings → Secrets and variables → Actions → Secrets**:

| Secret | Tác dụng |
| --- | --- |
| `EXPO_TOKEN` | Truy cập project `@igen-technology/schedule` và credentials build đã lưu |

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
| Tên hiển thị | `Schedule Support` |

Có thể kiểm tra từ Windows sau khi đăng nhập Expo đúng tài khoản/token:

```powershell
npx eas-cli@latest project:info
npx eas-cli@latest credentials --platform ios
```

Các lệnh quản lý credentials không tạo build. Profile `com.igen.3s` không phù hợp ứng dụng này. Khi credentials thiếu hoặc hết hạn, sửa trong trình quản lý rồi chạy lại workflow.

Build sử dụng `--freeze-credentials` để không tự thay credentials trong CI. `ASC_APP_ID` và API key upload không phải đầu vào của job chỉ tạo IPA.

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
  --output "$RUNNER_TEMP/ios-artifacts/schedule-support.ipa"
```

`npm run build:ios` trên máy cá nhân hoặc nhánh khác dừng với hướng dẫn chạy GitHub Actions. Đây là lệnh dành cho runner production.

Các script iOS cloud cũ `build:ios:test`, `build:ios:preview`, `build:ios:simulator`, `deploy:ios` đã được gỡ để mọi đường build iOS được cung cấp đi qua cùng điều kiện production.

Profile production trong [eas.json](eas.json) đặt `distribution: store`, `ios.simulator: false`, `ios.credentialsSource: remote`, `autoIncrement: true`. Số build được quản lý remote; nơi quản lý số build độc lập với nơi biên dịch. Mỗi lần tạo binary mới có thể tăng số, kể cả khi lần trước thất bại sau bước tăng số.

Nguồn: [eas.json](https://docs.expo.dev/eas/json/), [build versions](https://docs.expo.dev/build-reference/app-versions/).

## 6. Chạy và tải kết quả

1. Commit toàn bộ thay đổi workflow, scripts, tests, cấu hình và tài liệu.
2. Push develop và chờ CI đạt.
3. Merge vào production.
4. Vào **Actions → App CI and Production iOS IPA → lần chạy tương ứng**.
5. Theo dõi job **Build production IPA on GitHub macOS**.
6. Khi thành công, mở **Artifacts** và tải `schedule-support-ios-<run-id>-<attempt>`.
7. Giải nén để lấy `schedule-support.ipa` và `build-info.json`.

`build-info.json` và phần Summary của lần chạy ghi version, build number, commit, Bundle ID, Apple Team, phiên bản Xcode và SHA-256 của file IPA.

Xem [tải workflow artifact](https://docs.github.com/en/actions/how-tos/manage-workflow-runs/download-workflow-artifacts).

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
| Không tìm thấy Xcode 26.6 | Kiểm tra phần mềm runner; cập nhật `DEVELOPER_DIR` tới Xcode tương thích SDK 57 |
| Thiếu CocoaPods/fastlane | Đọc bước Check macOS build tools và chuẩn bị công cụ trên runner |
| Native compile thất bại | Đọc log bước Build signed production IPA locally |
| IPA kiểm tra thất bại | Đọc lỗi Bundle ID/profile/privacy/chữ ký ở bước Validate signed IPA |
| Không có artifact | Kiểm tra build và validation đều thành công; file được giữ 7 ngày |

SDK 57 hiện yêu cầu Xcode 26.4+; workflow chọn cụ thể 26.6 đang được liệt kê trên runner, cùng phiên bản Xcode của IPA cloud đã đối chiếu trước đây. Các trường chọn phần mềm trong `eas.json` không tự thiết lập môi trường local runner.

Nguồn: [SDK 57](https://docs.expo.dev/versions/v57.0.0/), [local build limitations](https://docs.expo.dev/build-reference/local-builds/#limitations), [runner software](https://github.com/actions/runner-images/blob/main/images/macos/macos-26-arm64-Readme.md).

## 9. Chi phí và trạng thái xác nhận

Runner tiêu chuẩn cho repo public miễn phí theo chính sách GitHub hiện hành. Repo private dùng hạn mức Actions; artifact có hạn mức lưu trữ riêng. Xem [Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions).

Workflow và scripts đã được sửa trong repo. Các kiểm tra mã nguồn chạy được trên Windows; biên dịch Xcode và kiểm tra chữ ký thực tế phải được xác nhận ở lần chạy production trên GitHub macOS. Không có cloud build nào được khởi tạo trong quá trình chỉnh sửa local.
