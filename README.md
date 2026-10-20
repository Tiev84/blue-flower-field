# Blue Flower Field

Một game web 3D nhỏ, chơi trên máy tính và điện thoại: dạo bước trên cánh đồng hoa xanh bất tận,
đi theo biển chỉ dẫn tới ngôi nhà nhỏ, vuốt ve ba chú mèo và nhận một bó hoa xanh.

**Chơi ngay:** https://tiev84.github.io/blue-flower-field/

## Điều khiển
- Máy tính: WASD / phím mũi tên để đi (Shift đi nhanh), kéo chuột để xoay camera, cuộn để zoom, E hoặc bấm vào mèo để vuốt ve.
- Điện thoại: kéo nửa trái màn hình để đi, kéo nửa phải để xoay camera, chạm vào mèo (hoặc nút 🐾) để vuốt ve.

## Chạy trên máy
```
python3 serve.py   # rồi mở http://127.0.0.1:8810
```
Không cần build: three.js 0.170 tải qua importmap từ jsDelivr.

## Cấu trúc
- `js/field.js` – bầu trời, mây, mặt đất, hoa và cỏ instanced chạy theo người chơi trên GPU, con đường, biển chỉ dẫn.
- `js/girl.js` – nhân vật dựng bằng code (theo ảnh mẫu), skinning lên bộ xương gọn; animation đi bộ retarget từ file Pisculli.
- `js/house.js` – ngôi nhà (chuyển từ casa.blend), cửa mở, nội thất, va chạm.
- `js/cats.js`, `js/finale.js` – ba chú mèo, tia sáng và bó hoa.
- `models/walk.json` – xoay xương theo thời gian của animation đi bộ.

## Ghi công
Model 3D lấy từ Sketchfab, đã chuyển đổi và giảm lưới cho nhẹ:
- Animation đi bộ: "Pisculli-WalkAnimation" – eapisculli (CC BY 4.0)
- Ngôi nhà nhỏ, bó hoa, mèo Munchkin, tượng mèo, Maxwell the cat – theo tác giả gốc trên Sketchfab
- Tiếng mèo kêu: "Cat meow sound effect" – RazendeGijs
