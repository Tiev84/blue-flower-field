# Lạc Như Simulator

Một game web 3D nhỏ, chơi trên máy tính và điện thoại: cùng Lạc Như dạo bước trên cánh đồng hoa xanh bất tận,
đi theo biển chỉ dẫn tới ngôi nhà nhỏ, vuốt ve ba chú mèo và nhận một bó hoa xanh.

**Chơi ngay:** https://tiev84.github.io/blue-flower-field/

## Điều khiển
- Máy tính: W/S đi tới/lùi (Shift đi nhanh), A/D xoay người, C (hoặc nút 🔄) để nhìn mặt trước, cuộn để zoom, E hoặc bấm vào mèo để vuốt ve.
- Điện thoại: kéo nửa trái màn hình để đi và xoay, nút 🔄 để nhìn mặt trước, chạm vào mèo (hoặc nút 🐾) để vuốt ve.
- Camera luôn nhìn sau lưng hoặc chính diện nhân vật.

## Chạy trên máy
```
python3 serve.py   # rồi mở http://127.0.0.1:8810
```
Không cần build: three.js 0.170 tải qua importmap từ jsDelivr.

## Cấu trúc
- `js/field.js` – bầu trời, mây, mặt đất, hoa và cỏ instanced chạy theo người chơi trên GPU, con đường, biển chỉ dẫn.
- `js/lacnhu.js` – Lạc Như: lưới 'visual hull' dựng từ bóng ảnh trước/bên (công cụ `tools/lacnhu.py`), ảnh gốc chiếu lại làm texture, skinning lên bộ xương gọn.
- `js/girl.js` – bộ xương + animation đi bộ retarget từ file Pisculli (và nhân vật hoạt hình dự phòng).
- `js/house.js` – ngôi nhà (chuyển từ casa.blend), cửa mở, nội thất, va chạm.
- `js/cats.js`, `js/finale.js` – ba chú mèo, tia sáng và bó hoa.
- `models/walk.json` – xoay xương theo thời gian của animation đi bộ.

## Ghi công
Model 3D lấy từ Sketchfab, đã chuyển đổi và giảm lưới cho nhẹ:
- Animation đi bộ: "character girl animated walk" (Sketchfab) – đoạn đi bộ trích từ Take 001; bản cũ: "Pisculli-WalkAnimation" – eapisculli (CC BY 4.0)
- Hoa trên cánh đồng: một bông của bó hoa, giảm còn ~70 tam giác
- Ngôi nhà nhỏ, bó hoa, mèo Munchkin, tượng mèo, Maxwell the cat – theo tác giả gốc trên Sketchfab
- Bầu trời: "Free Skybox Anime Sky" (Sketchfab)
- Tiếng mèo kêu: "Cat meow sound effect" – RazendeGijs
