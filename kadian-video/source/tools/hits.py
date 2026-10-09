# Drum hits on the 16th-note grid, at true attack times (attacks sit ~25 ms before the fitted beat grid).
import numpy as np, json, os
S = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SR = 48000; TRUE = -0.025
x = np.load(f"{S}/audio/stem_music.npy").astype(np.float64)
tl = json.load(open(f"{S}/film/timeline.json")); T = tl["T"]; t0 = tl["t0"]; NB = tl["total_beats"]
X = np.fft.rfft(x); f = np.fft.rfftfreq(len(x), 1 / SR)
def env(lo, hi, ms):
    Y = X.copy(); Y[(f < lo) | (f > hi)] = 0
    e = np.abs(np.fft.irfft(Y, len(x))); k = int(ms * SR / 1000)
    return np.convolve(e, np.ones(k) / k, "same")
def rise(e, t):
    a = int(t * SR)
    pre = e[max(0, a - int(.035 * SR)):a - int(.006 * SR)]
    post = e[a:a + int(.045 * SR)]
    if len(pre) == 0 or len(post) == 0: return 0.0, 0.0
    return post.max() - pre.mean(), pre.mean()
def detect(lo, hi, ms, name, rel_thr):
    e = env(lo, hi, ms); out = []
    vals = []
    for q in range(NB * 4):
        t = t0 + q * T / 4 + TRUE
        r, base = rise(e, t); vals.append((q, t, r, r / (base + 1e-4)))
    rs = np.array([v[2] for v in vals]); ref = np.percentile(rs, 99)
    for q, t, r, rel in vals:
        if r > rel_thr * ref and rel > 3.0:
            out.append([round(t, 4), round(float(min(1, (r / ref)) ** .9), 3), q / 4])
    ph = np.array([o[2] % 1 for o in out])
    print(name, len(out), "on-beat %.2f  8th %.2f  16th %.2f" % (np.mean(ph == 0), np.mean(ph == .5), np.mean((ph == .25) | (ph == .75))))
    return out
kick = detect(150, 300, 3, "kick", .16)
snare = detect(1800, 6500, 2, "snare", .26)
json.dump({"kick": [o[:2] for o in kick], "snare": [o[:2] for o in snare], "note": "true attack times, seconds"}, open(f"{S}/film/hits.json", "w"))
for name, h in (("kick", kick), ("snare", snare)):
    print(name, "beats 32-40:", [(o[2], o[1]) for o in h if 32 <= o[2] < 40])
    print(name, "beats 140-146:", [(o[2], o[1]) for o in h if 140 <= o[2] < 146])
