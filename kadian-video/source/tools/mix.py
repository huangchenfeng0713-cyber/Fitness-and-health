import numpy as np, json, os, subprocess, soundfile as sf, librosa
S = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SR = 48000
g = json.load(open(f"{S}/audio/grid.json")); T = g["T"]; t0 = g["t0"]
tl = json.load(open(f"{S}/film/timeline.json")); plan = json.load(open(f"{S}/film/music_plan.json"))
bars = plan["bars"]; TB = tl["total_beats"]
def bt(k): return t0 + k*T
def smp(t): return int(round(t*SR))
song, sr = sf.read(f"{S}/audio/song.wav", dtype="float32"); assert sr == SR
N = smp(bt(TB)) + SR//2
rng = np.random.default_rng(7)
sc = {s["name"]: s for s in tl["scenes"]}
DROP = sc["showcase"]["b0"]; SIL = sc["r4"]["silence"]; R4 = sc["r4"]["b0"]
TA = -0.025   # true drum attacks sit ~25 ms before the fitted beat grid
SP = 0.035    # splice point: just before the attack

# ---------- 1. arrange music by bar runs
runs = []
for b, j in enumerate(bars):
    if runs and j == runs[-1][1] + runs[-1][2] and b == runs[-1][0] + runs[-1][2]: runs[-1][2] += 1
    else: runs.append([b, j, 1])
music = np.zeros((N, 2), np.float32)
X = 0.025
for ri, (b, j, n) in enumerate(runs):
    o0 = bt(4*b) - SP; s0 = bt(4*j) - SP; dur = 4*n*T
    last = ri == len(runs) - 1
    if last: dur = len(song)/SR - s0          # final bar: keep the natural decay
    xin = 0.002 if 4*b == DROP else (0.0 if b == 0 else X)
    if b == 0: o_start, s_start = 0.0, 0.0
    else: o_start, s_start = o0 - xin, s0 - xin
    a = smp(o_start); off = smp(s_start) - a
    e = min(smp(o0 + dur), N, len(song) - off)
    seg = song[a+off:e+off].copy()
    L = len(seg)
    fi = smp(xin)
    if fi > 0: seg[:fi] *= np.sin(np.linspace(0, np.pi/2, fi))[:, None]
    if not last:   # fade-out over the X before the next run's boundary
        fo = smp(X); seg[L-0:] = seg[L-0:]
    music[a:a+L] += seg
    if not last:
        nb = runs[ri+1][0]; xo = 0.002 if 4*nb == DROP else X
        bnd = smp(bt(4*nb) - SP); fo = smp(xo)
        # the next run fades in over [bnd-fo, bnd]; we must fade this run out there and stop at bnd
        music[bnd-fo:bnd] -= seg[bnd-fo-a:bnd-a] * (1 - np.cos(np.linspace(0, np.pi/2, fo)))[:, None]
        music[bnd:a+L] -= seg[bnd-a:]
# silence before the drop
s_a, s_b = smp(bt(SIL[0]) - SP), smp(bt(SIL[1]) - SP)
fo = smp(0.04)
music[s_a-fo:s_a] *= np.linspace(1, 0, fo)[:, None]
music[s_a:s_b-smp(0.002)] = 0
# ending fade (after final hit, follow natural decay, then fade to 0 by the end)
end_t = bt(TB); fl = smp(1.2)
music[smp(end_t)-fl:smp(end_t)] *= np.linspace(1, 0, fl)[:, None]**2
music[smp(end_t):] = 0

# ---------- 2. tension build: filter sweep + gain ramp on r4 (applied via STFT mask below)
# ---------- 3. synthesized SFX
sfx = np.zeros((N, 2), np.float32)
def add(sig, t, gain=1.0, pan=0.0):
    a = smp(t); sig = np.asarray(sig, np.float32)
    if sig.ndim == 1: sig = np.stack([sig*(1-max(pan,0)), sig*(1+min(pan,0))], 1)
    e = min(a+len(sig), N); sfx[a:e] += sig[:e-a]*gain
def tt(d): return np.arange(int(d*SR))/SR
def onepole_lp(x, fc):
    a = np.exp(-2*np.pi*fc/SR); y = np.empty_like(x); s = 0.0
    # vectorized-ish via lfilter replacement
    from librosa.util import fix_length
    import numpy.lib.stride_tricks as st
    y = np.zeros_like(x); acc = 0.0
    for i in range(0, len(x), 1):
        acc = acc*a + (1-a)*x[i]; y[i] = acc
    return y
def boom(d=1.4, f0=78, f1=36):
    t = tt(d); f = f1 + (f0-f1)*np.exp(-t*9); ph = 2*np.pi*np.cumsum(f)/SR
    return np.sin(ph)*np.exp(-t*3.2)*(1-np.exp(-t*400))
def noise_burst(d, decay, hp=True):
    t = tt(d); n = rng.standard_normal(len(t)).astype(np.float32)
    if hp: n = np.diff(n, prepend=0)*0.7
    return n*np.exp(-t*decay)
def crash(d=2.2):
    n = noise_burst(d, 2.3, True); n2 = np.diff(n, prepend=0)
    t = tt(d); return (n*0.6+n2*0.5)*(1-np.exp(-t*800))
def snare(d=0.16):
    t = tt(d); body = np.sin(2*np.pi*190*t)*np.exp(-t*38)
    nz = rng.standard_normal(len(t))*np.exp(-t*30); nz = np.diff(nz, prepend=0)*0.8+nz*0.3
    return (body*0.7 + nz*0.6)*(1-np.exp(-t*2000))
def thump(d=0.5):
    t = tt(d); f = 45 + 90*np.exp(-t*30); ph = 2*np.pi*np.cumsum(f)/SR
    click = rng.standard_normal(len(t))*np.exp(-t*400)*0.3
    return (np.sin(ph)*np.exp(-t*7) + click)
def reverse_swell(d=0.45):
    n = noise_burst(d, 0.0, True); t = tt(d)
    env = (t/d)**3
    return n*env*0.6
def whoosh(d=0.6):
    t = tt(d); n = rng.standard_normal(len(t)).astype(np.float32)
    # moving band via crude spectral method: FFT bins weighted by time-varying envelope (approx with two blends)
    lo = np.convolve(n, np.ones(24)/24, 'same'); hi = n - lo
    x = t/d; env = np.sin(np.pi*x)**2
    return (lo*(1-x) + hi*x*0.5)*env
# title drop + main drop impacts
for beat, gain in [(32, 0.55), (DROP, 0.9)]:
    add(boom(), bt(beat) + TA, gain*0.9); add(crash(), bt(beat) + TA, gain*0.16)
add(reverse_swell(0.26), bt(DROP) + TA - 0.26, 0.16)
# riser over the build
rb0, rb1 = DROP - 18, SIL[0]
d = bt(rb1) - bt(rb0); t = tt(d); x = t/d
n = rng.standard_normal(len(t)).astype(np.float32)
spec = np.fft.rfft(n); fr = np.fft.rfftfreq(len(n), 1/SR)
# build riser as sum of 6 band slices whose gains move upward in time
bands = [(150,400),(400,900),(900,2000),(2000,4000),(4000,8000),(8000,16000)]
ris = np.zeros_like(n)
for k, (f0, f1) in enumerate(bands):
    m = (fr >= f0) & (fr < f1); sl = np.fft.irfft(spec*m, len(n)).astype(np.float32)
    c = (k+0.5)/len(bands); w = np.exp(-((x - c)/0.28)**2)
    ris += sl*w*(0.4+0.6*x)
ris /= np.abs(ris).max() + 1e-9
tone = np.sin(2*np.pi*np.cumsum(220*2**(x*2.0))/SR)*0.25
add((ris*0.8 + tone)*(x**1.6), bt(rb0) + TA, 0.21)
# accelerating snare roll
hits = []
for k in range(DROP - 16, DROP - 10, 1): hits.append(k)
for k in np.arange(DROP - 10, DROP - 6, 0.5): hits.append(k)
for k in np.arange(DROP - 6, DROP - 4, 0.25): hits.append(k)
for k in np.arange(DROP - 4, SIL[0], 0.125): hits.append(k)
for k in hits:
    prog = (k - (DROP - 16))/(SIL[0] - (DROP - 16))
    add(snare(), bt(k) + TA, 0.08 + 0.22*prog**1.5, pan=0.0)
# summary hits (four slams)
SUMB = sc["summary"]["b0"]
for k in [SUMB + 4, SUMB + 6, SUMB + 8, SUMB + 10]: add(thump(), bt(k) + TA, 0.55); add(noise_burst(0.25, 30), bt(k) + TA, 0.05)
# chapter card whooshes (into downbeats)
for k in [sc["r1"]["b0"], sc["r2"]["b0"], sc["r3"]["b0"], R4]:
    w = whoosh(0.55); add(w, bt(k) + TA - 0.5, 0.10); add(thump(0.3), bt(k) + TA, 0.25)
# the clap lab: two claps per trial bar, the sound shifted against the picture by the trial's offset
def clap(d=0.22):
    t = tt(d); out = np.zeros(len(t), np.float32)
    for j, dt in enumerate([0.0, 0.009, 0.017, 0.026]):
        a = int(dt * SR); n = rng.standard_normal(len(t) - a).astype(np.float32)
        env = np.exp(-np.arange(len(t) - a) / SR / (0.006 if j < 3 else 0.06))
        out[a:] += n * env * (0.8 if j < 3 else 1.0)
    X = np.fft.rfft(out); fr_ = np.fft.rfftfreq(len(out), 1 / SR)
    X *= np.exp(-((np.log2(np.maximum(fr_, 1) / 1600)) / 1.1) ** 2)
    y = np.fft.irfft(X, len(out)).astype(np.float32); return y / (np.abs(y).max() + 1e-9)
LAB = sc["lab"]
for k0, off in LAB["trials"]:
    for kk in (k0, k0 + 2):
        add(clap(), bt(kk) + TA + off, 0.75)
# end hit
add(boom(2.0, 70, 32), bt(sc["end"]["b0"]) + TA, 0.55)

# ---------- 4. narration
voice = np.zeros(N, np.float32)
speech = []
for nline in tl["narr"]:
    y, vsr = librosa.load(f"{S}/tts/{nline['id']}.mp3", sr=SR, mono=True)
    a = smp(nline["start"]); e = min(a+len(y), N); voice[a:e] += y[:e-a]
    speech.append((nline["words"][0]["t"], nline["end"]))
# HPF voice (remove rumble) + level
Vf = np.fft.rfft(voice); fr = np.fft.rfftfreq(N, 1/SR)
Vf *= 1/(1+(70/np.maximum(fr,1))**4)
voice = np.fft.irfft(Vf, N).astype(np.float32)
act = np.abs(voice) > 1e-4
v_rms = np.sqrt(np.mean(voice[act]**2)); voice *= 10**(-19/20)/v_rms
print("voice rms set to -19 dBFS (active)")

# ---------- 5. STFT automation on music (ducking + build filter)
nfft, hop = 2048, 512
fr = librosa.fft_frequencies(sr=SR, n_fft=nfft)
nfr = 1 + N//hop
ft = librosa.frames_to_time(np.arange(nfr), sr=SR, hop_length=hop, n_fft=nfft)
# narration activity -> duck amount 0..1 (attack 90ms, release 450ms, lookahead 120ms)
tgt = np.zeros(nfr)
for a, e in speech: tgt[(ft >= a - 0.12) & (ft <= e + 0.10)] = 1
duck = np.zeros(nfr); v = 0.0; dt = hop/SR
for i in range(nfr):
    k = 1-np.exp(-dt/(0.09 if tgt[i] > v else 0.45)); v += (tgt[i]-v)*k; duck[i] = v
# band duck depths (dB)
lf = np.log2(np.maximum(fr, 20))
def interp_db(points):
    xs = np.log2([p[0] for p in points]); ys = [p[1] for p in points]
    return np.interp(lf, xs, ys)
depth = interp_db([(20, -4), (150, -5), (300, -8), (1000, -11.5), (3500, -12.5), (7000, -9), (16000, -8)])
G = 10**((depth[:, None]*duck[None, :])/20)
# r4 build: lowpass sweep + gain ramp (beats R4 -> SIL[0])
b_t = (ft - t0)/T
prog = np.clip((b_t - (R4+2))/(SIL[0]-1 - (R4+2)), 0, 1)
inb = (b_t >= R4 - 0.5) & (b_t < SIL[0])
fc = 280*(18000/280)**(prog**1.7)
lp = 1/np.sqrt(1+(fr[:, None]/fc[None, :])**6)
ramp = 10**((-7*(1-prog))/20)
Mb = np.where(inb[None, :], lp*ramp[None, :], 1.0)
# fade the filter in over 1 beat before R4 to avoid a jump
pre = (b_t >= R4 - 1.5) & (b_t < R4 - 0.5)
w = np.clip((b_t - (R4 - 1.5)), 0, 1)
Mb = np.where(pre[None, :], (1-w)[None, :] + w[None, :]*lp*ramp[None, :], Mb)
tr_a = bt(LAB["trials"][0][0]) - 0.7; tr_b = bt(LAB["trials"][-1][0] + 4) + 0.15
lab_g = np.ones(nfr)
up = np.clip((ft - tr_a) / 0.35, 0, 1); dn = np.clip((tr_b + 0.5 - ft) / 0.5, 0, 1)
lab_g = 1 - (1 - 10 ** (-30 / 20)) * np.minimum(up, dn)
M = (G*Mb*lab_g[None, :]).astype(np.float32)
mus_proc = np.zeros_like(music)
for ch in range(2):
    Z = librosa.stft(music[:, ch], n_fft=nfft, hop_length=hop)
    Z = Z[:, :nfr]*M[:, :Z.shape[1]]
    mus_proc[:, ch] = librosa.istft(Z, hop_length=hop, n_fft=nfft, length=N)
# ---------- 6. sum, loudness, limiter
music_gain = 10**(-3.5/20)
mix = mus_proc*music_gain + sfx*0.9 + voice[:, None]*np.array([1.0, 1.0], np.float32)
sf.write(f"{S}/audio/mix_pre.wav", mix, SR, subtype="FLOAT")
out = subprocess.run(["ffmpeg", "-hide_banner", "-i", f"{S}/audio/mix_pre.wav", "-af", "ebur128", "-f", "null", "-"], capture_output=True, text=True).stderr
I = float([l for l in out.splitlines() if l.strip().startswith("I:")][-1].split()[1])
print("integrated", I)
LG = 10**((-14.5 - I)/20); mix *= LG
# look-ahead peak limiter at -1.2 dBFS
ceil = 10**(-1.2/20); la = smp(0.004)
pk = np.abs(mix).max(1)
need = np.minimum(1.0, ceil/np.maximum(pk, 1e-9))
# min filter over lookahead window
from numpy.lib.stride_tricks import sliding_window_view
padn = np.concatenate([need, np.ones(la)])
gmin = sliding_window_view(padn, la+1).min(1)[:N]
gs = np.empty(N, np.float32); v = 1.0; rel = np.exp(-1/(0.08*SR)); att = np.exp(-1/(0.0015*SR))
for i in range(N):
    x = gmin[i]
    v = att*v + (1-att)*x if x < v else rel*v + (1-rel)*x
    gs[i] = v
mix = mix*gs[:, None]
mix = np.clip(mix, -ceil, ceil)
np.save(f"{S}/audio/chk_voice.npy", (voice*LG*gs).astype(np.float32)); np.save(f"{S}/audio/chk_bed.npy", ((mus_proc*music_gain + sfx*0.9).mean(1)*LG*gs).astype(np.float32))
sf.write(f"{S}/audio/final_mix.wav", mix.astype(np.float32), SR, subtype="PCM_24")
# stems for analysis (music+sfx dry, pre-duck)
stem = (music*music_gain + sfx*0.9).mean(1)
np.save(f"{S}/audio/stem_music.npy", stem.astype(np.float32))
print("done", N/SR)
