"""Clean up the retargeted walk (models/walk_src.json -> models/walk.json):
- legs keep only their forward/back swing (rotation about the hip axis, x),
  so the feet don't swing out sideways
- hips and torso sway damped
- the right arm mirrors the left half a cycle later (the source right arm barely moves)
"""
import json, math, sys
src, dst = sys.argv[1], sys.argv[2]
d = json.load(open(src))
def slerp_id(q, k):
    x, y, z, w = q
    if w < 0: x, y, z, w = -x, -y, -z, -w
    a = math.acos(max(-1, min(1, w)))
    if a < 1e-6: return [0, 0, 0, 1]
    f = math.sin(a * k) / math.sin(a)
    return [x * f, y * f, z * f, math.cos(a * k)]
def twist_x(q):
    """the part of q that turns about the x axis (swing-twist decomposition)"""
    x, y, z, w = q
    l = math.hypot(x, w) or 1
    return [x / l, 0.0, 0.0, w / l]
n = len(d['times']) - 1; half = n // 2
for b in ['clav', 'arm', 'fore', 'hand']:
    srcq = d['q'][b + 'L']
    d['q'][b + 'R'] = [[srcq[(i + half) % n][0], -srcq[(i + half) % n][1], -srcq[(i + half) % n][2], srcq[(i + half) % n][3]] for i in range(n + 1)]
for b, k in [('hips', 0.12), ('spine', 0.12), ('chest', 0.25), ('neck', 0.3), ('head', 0.3)]:
    d['q'][b] = [slerp_id(q, k) for q in d['q'][b]]
for s in 'LR':
    for b in ['thigh', 'shin', 'foot', 'toe']:
        d['q'][b + s] = [twist_x(q) for q in d['q'][b + s]]
d['q'] = {k: [[round(v, 5) for v in q] for q in qs] for k, qs in d['q'].items()}
d['note'] = 'walkfix: legs swing forward/back only; torso sway damped; right arm mirrored from the left'
json.dump(d, open(dst, 'w'), separators=(',', ':'))
