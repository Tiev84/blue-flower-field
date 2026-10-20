"""Build a textured, skinned character from a front / back / side turnaround.

The body is a 'visual hull': a voxel is solid if it falls inside the front
silhouette (x, y) and the side silhouette (z, y), and inside a rounded
cross-section chosen per body part (torso, arms, legs, head). Marching cubes
turns it into one watertight mesh; the three photos are projected back onto
it in the shader (weights by surface normal).

usage: lacnhu.py imgdir walk.json outdir
"""
import sys, json, struct, numpy as np
from PIL import Image
from scipy import ndimage as nd
from skimage import measure
import fast_simplification

D, WALK, OUT = sys.argv[1], sys.argv[2], sys.argv[3]
H_M = 1.6           # character height in metres
VOX = 0.005         # voxel size
TARGET_TRIS = int(sys.argv[4]) if len(sys.argv) > 4 else 16000

def load(n):
    a = np.load(f'{D}/{n}_alpha.npy') > 127
    a = nd.binary_closing(a, structure=np.ones((1, 9)))  # fuse fingers
    lab, k = nd.label(a); sz = nd.sum(a, lab, range(1, k + 1)); a = lab == (np.argmax(sz) + 1)
    return nd.binary_fill_holes(a)
M = {n: load(n) for n in ['front', 'back', 'side']}
IM = {n: np.asarray(Image.open(f'{D}/{n}.jpg').convert('RGB')) for n in M}

def rows(m):
    ys = np.nonzero(m.any(1))[0]; return ys.min(), ys.max()
V = {}
for n, m in M.items():
    top, bot = rows(m); s = (bot - top) / H_M
    V[n] = {'top': top, 'bot': bot, 's': s}
def intervals(r):
    d = np.diff(np.concatenate([[0], r.astype(np.int8), [0]])); return list(zip(np.nonzero(d == 1)[0], np.nonzero(d == -1)[0]))
def row_of(n, y): return int(round(V[n]['bot'] - y * V[n]['s']))
# horizontal centres: front/back from the legs, side from the chest
for n in ['front', 'back']:
    iv = intervals(M[n][row_of(n, 0.5)]); iv = sorted(iv, key=lambda t: t[0] - t[1])[:2]
    V[n]['c'] = np.mean([(a + b) / 2 for a, b in iv])
iv = intervals(M['side'][row_of('side', 0.9)]); a, b = max(iv, key=lambda t: t[1] - t[0]); V['side']['c'] = (a + b) / 2
print({n: {k: round(float(v), 2) for k, v in V[n].items()} for n in V})

def front_iv(y):
    """front silhouette intervals at height y, in metres of x (character's left = +x)"""
    r = M['front'][row_of('front', y)]
    return [((a - V['front']['c']) / V['front']['s'], (b - 1 - V['front']['c']) / V['front']['s']) for a, b in intervals(r) if b - a > 3]
def side_range(y):
    r = M['side'][row_of('side', y)]
    iv = [t for t in intervals(r) if t[1] - t[0] > 6]
    if not iv: return None
    a = min(t[0] for t in iv); b = max(t[1] for t in iv)
    return ((a - V['side']['c']) / V['side']['s'], (b - 1 - V['side']['c']) / V['side']['s'])

# ---------------------------------------------------------------- landmarks
ys = np.arange(0, H_M + VOX, VOX)
# crotch: lowest row above which the legs join
crotch = None
for y in np.arange(0.4, 1.0, 0.0025):
    iv = [t for t in front_iv(y) if abs((t[0] + t[1]) / 2) < 0.16]
    if len(iv) <= 1 and crotch is None and y > 0.55: crotch = y
print('crotch', crotch)
# arms: outer intervals where they are separate from the body
arm = {1: [], -1: []}
armTop = None
for y in np.arange(crotch - 0.03, 1.2, 0.0025):
    iv = front_iv(y)
    if len(iv) >= 3:
        armTop = y
        for side, t in ((1, iv[-1]), (-1, iv[0])):
            arm[side].append((y, (t[0] + t[1]) / 2, t[1] if side > 0 else t[0], (t[1] - t[0]) / 2))
print('arms separate up to', armTop)
fits = {}
for side in (1, -1):
    A = np.array(arm[side]); sel = A[:, 0] > crotch + 0.12
    p = np.polyfit(A[sel, 0], A[sel, 1], 1); fits[side] = p
# torso half-width where sleeves join the body
iv0 = front_iv(armTop - 0.01); mid = iv0[len(iv0) // 2]
T0 = (mid[1] - mid[0]) / 2; TC = (mid[1] + mid[0]) / 2
SHOULDER_Y = armTop + 0.21
def torso_half(y): return T0 + (0.155 - T0) * float(np.clip((y - armTop) / (SHOULDER_Y + 0.02 - armTop), 0, 1)) ** 2
print('T0', T0, 'TC', TC)

# side centre line of the body (for the arms' depth)
zc_line = {}
for y in ys:
    r = side_range(y)
    if r: zc_line[round(y, 4)] = (r[0] + r[1]) / 2
def zc_at(y):
    ks = np.array(list(zc_line.keys())); i = np.argmin(np.abs(ks - y)); return zc_line[ks[i]]

# ---------------------------------------------------------------- voxels
X = np.arange(-0.34, 0.34, VOX); Z = np.arange(-0.2, 0.22, VOX)
XX, ZZ = np.meshgrid(X, Z, indexing='ij')
vol = np.zeros((len(X), len(ys), len(Z)), np.float32)
label = np.zeros((len(X), len(ys), len(Z)), np.int8)  # 0 none, 1 body, 2 arm L, 3 arm R, 4 leg L, 5 leg R
fs = V['front']['s']; ss = V['side']['s']
def supe(u, v, p): return np.abs(u) ** p + np.abs(v) ** p <= 1
for j, y in enumerate(ys):
    if y < 0.003: continue
    fr = M['front'][row_of('front', y)]; sr = M['side'][row_of('side', y)]
    fx = fr[np.clip(np.round(V['front']['c'] + X * fs).astype(int), 0, fr.size - 1)]
    sz = sr[np.clip(np.round(V['side']['c'] + Z * ss).astype(int), 0, sr.size - 1)]
    base = fx[:, None] & sz[None, :]
    rng = side_range(y)
    if rng is None or not base.any(): continue
    za, zb = rng; zc = (za + zb) / 2; hz = max(0.01, (zb - za) / 2)
    iv = front_iv(y)
    solid = np.zeros_like(base); lab = np.zeros(base.shape, np.int8)
    def body(a, b, p, code):
        xc = (a + b) / 2; hx = max(0.008, (b - a) / 2 + VOX)
        m = supe((XX - xc) / hx, (ZZ - zc) / (hz + VOX), p)
        solid[m] = True; lab[m & (lab == 0)] = code
    if y >= SHOULDER_Y:
        for a, b in iv: body(a, b, 2.0 if y > 1.32 else 2.4, 1)
    elif y >= armTop:
        # sleeves are joined to the body here: split at the torso edge
        T = torso_half(y); a, b = iv[0][0], iv[-1][1]
        body(max(a, TC - T), min(b, TC + T), 2.6, 1)
        for side, outer in ((1, b), (-1, a)):
            cx = np.polyval(fits[side], y); rx = abs(outer - cx)
            if side * (outer - (TC + side * T)) <= 0.004: continue
            czA = zc_at(y) - 0.045
            m = supe((XX - cx) / (rx + VOX), (ZZ - czA) / (rx * 0.95 + VOX), 2.0)
            solid[m] = True; lab[m & (lab != 1)] = 2 if side > 0 else 3
    else:
        for a, b in iv:
            c = (a + b) / 2
            if abs(c) > 0.165 and y > crotch - 0.04:  # an arm / hand
                side = 1 if c > 0 else -1; rx = (b - a) / 2
                k = 0.95 if y > crotch + 0.09 else 1.45  # the hand is wider seen from the side
                czA = zc_at(y) - (0.045 if y > crotch + 0.09 else 0.02)
                m = supe((XX - c) / (rx + VOX), (ZZ - czA) / (rx * k + VOX), 2.0)
                solid[m] = True; lab[m] = 2 if side > 0 else 3
            elif y < crotch:
                body(a, b, 2.2, 4 if c > 0 else 5)
            else:
                body(a, b, 2.6, 1)
    m = solid & base
    vol[:, j, :] = m; label[:, j, :] = np.where(m, lab, 0)

print('voxels', int(vol.sum()))
sm = nd.gaussian_filter(vol, 1.1)
verts, faces, normals, _ = measure.marching_cubes(sm, 0.5, spacing=(VOX, VOX, VOX))
verts += [X[0], ys[0], Z[0]]
faces = faces[:, ::-1]  # outward winding for three.js
print('mc', len(verts), len(faces))

# Taubin smoothing
def taubin(v, f, it=8, lam=0.5, mu=-0.53):
    n = len(v); e = np.concatenate([f[:, [0, 1]], f[:, [1, 2]], f[:, [2, 0]]]); e = np.concatenate([e, e[:, ::-1]])
    deg = np.bincount(e[:, 0], minlength=n).astype(float)
    for _ in range(it):
        for k in (lam, mu):
            acc = np.zeros_like(v); np.add.at(acc, e[:, 0], v[e[:, 1]]); v = v + k * (acc / deg[:, None] - v)
    return v
verts = taubin(verts, faces)
pv, fv = fast_simplification.simplify(verts.astype(np.float32), faces.astype(np.int32), target_reduction=max(0, 1 - TARGET_TRIS / len(faces)))
pv = taubin(pv.astype(float), fv, it=3)
print('decimated', len(pv), len(fv))
def vnormals(v, f):
    n = np.zeros_like(v); fn = np.cross(v[f[:, 1]] - v[f[:, 0]], v[f[:, 2]] - v[f[:, 0]])
    for k in range(3): np.add.at(n, f[:, k], fn)
    return n / np.maximum(np.linalg.norm(n, axis=1, keepdims=True), 1e-9)
N = vnormals(pv, fv)

# ---------------------------------------------------------------- atlas
AH = 2048
crops = {}; tiles = []; ox = 0
for n in ['front', 'back', 'side']:
    m = M[n]; yy, xx = np.nonzero(m)
    x0, x1 = xx.min() - 24, xx.max() + 24; y0, y1 = yy.min() - 24, yy.max() + 24
    k = AH / (y1 - y0)
    img = IM[n].copy()
    # bleed the figure's colours into the background so edges never pick up grey
    dist, (iy, ix) = nd.distance_transform_edt(~nd.binary_erosion(m, iterations=2), return_indices=True)
    img = img[iy, ix]
    tile = Image.fromarray(img[y0:y1, x0:x1]).resize((int((x1 - x0) * k), AH), Image.LANCZOS)
    crops[n] = {'x0': x0, 'y0': y0, 'k': k, 'ox': ox}; tiles.append(tile); ox += tile.width
AW = 2048
atlas = Image.new('RGB', (AW, AH))
for t, n in zip(tiles, crops): atlas.paste(t, (crops[n]['ox'], 0))
atlas.save(f'{OUT}/lacnhu.jpg', quality=88)
print('atlas width used', ox)
def proj(n, h, y):
    c = crops[n]; px = V[n]['c'] + h * V[n]['s']; py = V[n]['bot'] - y * V[n]['s']
    return np.stack([((px - c['x0']) * c['k'] + c['ox']) / AW, 1 - ((py - c['y0']) * c['k']) / AH], 1)
uvF = proj('front', pv[:, 0], pv[:, 1]); uvB = proj('back', -pv[:, 0], pv[:, 1]); uvS = proj('side', pv[:, 2], pv[:, 1])

# per-vertex body part from the voxel labels
ix = np.clip(np.round((pv[:, 0] - X[0]) / VOX).astype(int), 0, len(X) - 1)
iy = np.clip(np.round((pv[:, 1] - ys[0]) / VOX).astype(int), 0, len(ys) - 1)
iz = np.clip(np.round((pv[:, 2] - Z[0]) / VOX).astype(int), 0, len(Z) - 1)
lab_d = label.copy()
idx = nd.distance_transform_edt(lab_d == 0, return_distances=False, return_indices=True)
part = lab_d[idx[0][ix, iy, iz], idx[1][ix, iy, iz], idx[2][ix, iy, iz]]

# projection weights: front / back / side by normal, side damped where the arm hides the body
nz, nx = N[:, 2], N[:, 0]
wF = np.maximum(nz, 0) ** 3 + 0.02; wB = np.maximum(-nz, 0) ** 3 + 0.02; wS = np.abs(nx) ** 3 + 0.01
hidden = (part == 1) & (pv[:, 1] > crotch - 0.05) & (pv[:, 1] < SHOULDER_Y)
wS = np.where(hidden, wS * 0.15, wS)
# head and neck: the hull is as wide as the hair, so the profile photo would
# paint a second face on its flank; let the front/back photos wrap round
headz = pv[:, 1] > SHOULDER_Y - 0.04
wS = np.where(headz, 0.0, wS)
wS = np.where(N[:, 1] > 0.6, wS * 0.2, wS)
W3 = np.stack([wF, wB, wS], 1); W3 /= W3.sum(1, keepdims=True)

# ---------------------------------------------------------------- rig
walk = json.load(open(WALK)); names = [b[0] for b in walk['bones']]; BI = {n: i for i, n in enumerate(names)}
def arm_pt(side, y): return np.array([np.polyval(fits[side], y), y, zc_at(y) - 0.045])
def leg_c(side, y):
    iv = [t for t in front_iv(y) if (t[0] + t[1]) / 2 * side > 0.02]; t = iv[0] if side < 0 else iv[-1]
    return (t[0] + t[1]) / 2
J = {}
J['hips'] = [0, crotch + 0.1, zc_at(crotch + 0.1)]
J['spine'] = [0, crotch + 0.25, zc_at(crotch + 0.25)]
J['chest'] = [0, armTop + 0.08, zc_at(armTop + 0.08)]
J['neck'] = [0, SHOULDER_Y + 0.04, zc_at(SHOULDER_Y + 0.04) + 0.01]
J['head'] = [0, SHOULDER_Y + 0.11, zc_at(SHOULDER_Y + 0.11) + 0.015]
J['hairA'] = [0, SHOULDER_Y + 0.15, J['head'][2] - 0.08]; J['hairB'] = [0, SHOULDER_Y - 0.05, J['head'][2] - 0.1]
yS, yE, yW = SHOULDER_Y - 0.035, armTop - 0.02, crotch + 0.1
for side, s in ((1, 'L'), (-1, 'R')):
    J['clav' + s] = [side * 0.04, SHOULDER_Y - 0.01, J['chest'][2] - 0.01]
    J['arm' + s] = arm_pt(side, yS).tolist(); J['fore' + s] = arm_pt(side, yE).tolist(); J['hand' + s] = arm_pt(side, yW).tolist()
    J['hand' + s][2] += 0.02
    yK, yA = 0.46, 0.085
    sr = side_range(0.03)
    J['thigh' + s] = [leg_c(side, crotch - 0.05), crotch + 0.07, zc_at(crotch)]
    J['shin' + s] = [leg_c(side, yK), yK, zc_at(yK)]
    J['foot' + s] = [leg_c(side, 0.15), yA, zc_at(0.2)]
    J['toe' + s] = [leg_c(side, 0.05), 0.03, sr[1] - 0.07]
J = {k: [float(x) for x in v] for k, v in J.items()}
print({k: [round(x, 3) for x in v] for k, v in J.items()})

def sm_(a, b, x): t = np.clip((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t)
def chain_w(P, chain):
    """weights along a chain of joints by projection onto its segments (soft at joints)"""
    pts = np.array([J[c] for c in chain]); n = len(P); W = np.zeros((n, len(names)))
    # parameter along the chain
    best = np.full(n, 1e9); seg = np.zeros(n, int); tt = np.zeros(n)
    for i in range(len(pts) - 1):
        a, b = pts[i], pts[i + 1]; ab = b - a; L2 = ab @ ab
        t = ((P - a) @ ab) / L2; tc = np.clip(t, 0, 1); d = np.linalg.norm(P - (a + tc[:, None] * ab), axis=1)
        upd = d < best; best[upd] = d[upd]; seg[upd] = i; tt[upd] = t[upd]
    for i in range(len(pts) - 1):
        m = seg == i; L = np.linalg.norm(pts[i + 1] - pts[i]); bl = min(0.06, L * 0.3) / L
        w_next = sm_(1 - bl, 1 + bl, tt[m]) * (i + 1 < len(chain) - 1 or True)
        w_prev = (1 - sm_(-bl, bl, tt[m])) if i > 0 else np.zeros(m.sum())
        cur = 1 - 0.5 * w_next - 0.5 * w_prev
        W[m, BI[chain[i]]] += cur
        if i + 1 < len(chain): W[m, BI[chain[i + 1]]] += 0.5 * w_next
        if i > 0: W[m, BI[chain[i - 1]]] += 0.5 * w_prev
    return W
n = len(pv); Wt = np.zeros((n, len(names)))
y = pv[:, 1]
bodyW = np.zeros((n, len(names)))
spine_chain = ['hips', 'spine', 'chest', 'neck', 'head']
hy = [J[c][1] for c in spine_chain]
for i, c in enumerate(spine_chain):
    lo = hy[i - 1] if i > 0 else -9; hi = hy[i + 1] if i + 1 < len(hy) else 9
    up = sm_(lo, hy[i], y) if i > 0 else np.ones(n); dn = 1 - sm_(hy[i], hi, y) if i + 1 < len(hy) else np.ones(n)
    bodyW[:, BI[c]] = np.minimum(up, dn)
bodyW /= bodyW.sum(1, keepdims=True)
for side, s, code in ((1, 'L', 2), (-1, 'R', 3)):
    m = part == code
    W = chain_w(pv[m], ['arm' + s, 'fore' + s, 'hand' + s])
    # the top of the sleeve blends into the shoulder
    k = sm_(SHOULDER_Y - 0.02, SHOULDER_Y + 0.03, y[m])[:, None]
    W = W * (1 - k * 0.6); W[:, BI['chest']] += k[:, 0] * 0.4; W[:, BI['clav' + s]] += k[:, 0] * 0.2
    Wt[m] = W
for side, s, code in ((1, 'L', 4), (-1, 'R', 5)):
    m = part == code
    W = chain_w(pv[m], ['thigh' + s, 'shin' + s, 'foot' + s, 'toe' + s])
    k = (1 - sm_(crotch - 0.07, crotch + 0.02, y[m]))[:, None]
    Wt[m] = W * k + bodyW[m] * (1 - k)
mb = part == 1
Wt[mb] = bodyW[mb]
# hips region near the legs follows the thighs a little
for side, s in ((1, 'L'), (-1, 'R')):
    m = mb & (pv[:, 0] * side > 0.02) & (y < crotch + 0.1)
    k = (1 - sm_(crotch - 0.02, crotch + 0.1, y[m])) * 0.5
    Wt[m] *= (1 - k)[:, None]; Wt[m, BI['thigh' + s]] += k
# body next to the arms (armpits) follows the arm a little
for side, s in ((1, 'L'), (-1, 'R')):
    m = mb & (pv[:, 0] * side > 0.09) & (y > armTop - 0.05) & (y < SHOULDER_Y + 0.02)
    k = sm_(0.09, 0.15, pv[m, 0] * side) * 0.35
    Wt[m] *= (1 - k)[:, None]; Wt[m, BI['arm' + s]] += k
Wt /= np.maximum(Wt.sum(1, keepdims=True), 1e-9)
top4 = np.argsort(-Wt, 1)[:, :4]; w4 = np.take_along_axis(Wt, top4, 1); w4 /= w4.sum(1, keepdims=True)

# ---------------------------------------------------------------- write
buf = bytearray()
def put(a):
    while len(buf) % 4: buf.append(0)
    off = len(buf); buf.extend(np.ascontiguousarray(a).tobytes()); return off
meta = {'count': int(n), 'tris': int(len(fv)), 'joints': J, 'height': H_M,
        'pos': put(pv.astype(np.float32)), 'nrm': put(N.astype(np.float32)),
        'uvF': put(uvF.astype(np.float32)), 'uvB': put(uvB.astype(np.float32)), 'uvS': put(uvS.astype(np.float32)),
        'wv': put(W3.astype(np.float32)), 'si': put(top4.astype(np.uint16)), 'sw': put(w4.astype(np.float32)),
        'idx': put(fv.astype(np.uint16 if n < 65536 else np.uint32).reshape(-1)), 'idx32': n >= 65536}
open(f'{OUT}/lacnhu.bin', 'wb').write(buf)
json.dump(meta, open(f'{OUT}/lacnhu.json', 'w'))
print('bin', len(buf))
