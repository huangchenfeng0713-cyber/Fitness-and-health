import json, numpy as np, os
S = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
Sm = np.load(f"{S}/audio/ssm.npy"); rms = np.load(f"{S}/audio/ssm_rms.npy")*100
tl = json.load(open(f"{S}/film/timeline.json"))
NB = tl["total_beats"]//4; NS = Sm.shape[0]
role = ["narr"]*NB
fixed = {}
for s in tl["scenes"]:
    b0, b1 = s["b0"]//4, s["b1"]//4
    for b in range(b0, b1):
        if s["name"] in ("demoA", "pip", "showcase", "summary"): role[b] = "demo"
for b in range(8): fixed[b] = b
fixed[8], fixed[9] = 8, 9
r4 = [s for s in tl["scenes"] if s["name"] == "r4"][0]
for i in range(8): fixed[r4["b0"]//4 + i] = 36 + i
sc = [s for s in tl["scenes"] if s["name"] == "showcase"][0]
for i in range(4): fixed[sc["b0"]//4 + i] = 8 + i
en = [s for s in tl["scenes"] if s["name"] == "end"][0]
fixed[en["b0"]//4] = 62
for b in range(en["b0"]//4 + 1, NB): fixed[b] = -1   # tail (silence / decay)
AB = set(range(0, 8)) | set(range(36, 44))
def unary(b, j):
    if b in fixed: return 0 if fixed[b] == j else 1e9
    if j == 62 or j in AB: return 1e9
    hi = rms[j] > 37
    C = 8 <= j <= 21
    if role[b] == "demo": return 0 if hi else (0.3 if C else 0.6)
    return 0.8 if hi else 0.0
def trans(i, j):
    if j == i + 1: return 0.0
    s = Sm[i, j-1] if j > 0 else 0
    if s >= 0.9: return 0.4 + (1-s)*4
    if s >= 0.85: return 1.2 + (1-s)*4
    return 1e9
NBm = max(k for k in range(NB) if fixed.get(k, 0) != -1) + 1
cost = np.full((NBm, NS), 1e18); back = np.zeros((NBm, NS), int)
for j in range(NS): cost[0, j] = unary(0, j)
for b in range(1, NBm):
    for j in range(NS):
        u = unary(b, j)
        if u >= 1e9: continue
        best = 1e18; arg = 0
        for i in range(NS):
            if cost[b-1, i] >= 1e17: continue
            c = cost[b-1, i] + trans(i, j)
            if c < best: best, arg = c, i
        cost[b, j] = best + u; back[b, j] = arg
j = int(np.argmin(cost[-1])); path = [j]
for b in range(NBm-1, 0, -1): j = back[b, j]; path.append(j)
path = path[::-1]
print("cost", cost[-1].min())
for b, j in enumerate(path):
    sc = next(s["name"] for s in tl["scenes"] if s["b0"] <= 4*b < s["b1"])
    jump = "" if b == 0 or j == path[b-1] + 1 else f"  <-- jump sim={Sm[path[b-1], j-1]:.2f}"
    print(f"out {b:2d} [{sc:8s}] src {j:2d} rms {rms[j]:4.1f}{jump}")
json.dump({"bars": [int(x) for x in path], "tail_from": NBm}, open(f"{S}/film/music_plan.json", "w"))
