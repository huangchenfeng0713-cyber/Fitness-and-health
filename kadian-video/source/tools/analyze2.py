import librosa, numpy as np, json, sys
from PIL import Image, ImageDraw, ImageFont
y, sr = librosa.load(sys.argv[1], sr=22050, mono=True)
hop=256
oenv = librosa.onset.onset_strength(y=y, sr=sr, hop_length=hop)
tempo, beats = librosa.beat.beat_track(onset_envelope=oenv, sr=sr, hop_length=hop, tightness=200)
bt = librosa.frames_to_time(beats, sr=sr, hop_length=hop)
i = np.arange(len(bt))
A = np.vstack([i, np.ones_like(i)]).T
T, t0 = np.linalg.lstsq(A, bt, rcond=None)[0]
res = bt - (t0 + i*T)
print("grid T", T, "bpm", 60/T, "t0", t0, "resid max", np.abs(res).max(), "std", res.std())
# refine t0 using onset envelope: maximize sum of oenv at grid positions across fine shifts
times = librosa.frames_to_time(np.arange(len(oenv)), sr=sr, hop_length=hop)
best=None
for dT in np.linspace(-0.002,0.002,41):
  for d0 in np.linspace(-0.05,0.05,101):
    g = t0+d0 + np.arange(0, 260)*(T+dT)
    g = g[g<times[-1]]
    v = np.interp(g, times, oenv).sum()
    if best is None or v>best[0]: best=(v,T+dT,t0+d0)
print("refined", best, 60/best[1])
T, t0 = best[1], best[2]
# kick energy per beat (low band) to find downbeat phase
Sx = np.abs(librosa.stft(y, n_fft=2048, hop_length=hop))
f = librosa.fft_frequencies(sr=sr, n_fft=2048)
low = Sx[f<120].sum(0)
nb = int((times[-1]-t0)/T)
lowb = np.array([low[int((t0+k*T)*sr/hop): int((t0+k*T)*sr/hop)+6].max() for k in range(nb)])
for ph in range(4):
    print("phase",ph, lowb[ph::4][:60].mean())
# mel spectrogram image
M = librosa.feature.melspectrogram(y=y, sr=sr, hop_length=hop, n_mels=128, fmax=11000)
D = librosa.power_to_db(M, ref=np.max)
D = (np.clip((D+70)/70,0,1)*255).astype(np.uint8)[::-1]
W = 3200; H=128*2
img = Image.fromarray(D).resize((W,H))
img = img.convert("RGB")
canvas = Image.new("RGB",(W,H+200),(0,0,0))
canvas.paste(img,(0,0))
d = ImageDraw.Draw(canvas)
dur = len(y)/sr
font = ImageFont.truetype("/usr/share/fonts/truetype/wqy/wqy-zenhei.ttc", 14)
for k in range(nb):
    x = (t0+k*T)/dur*W
    if k%4==0:
        d.line([(x,H),(x,H+40)], fill=(255,80,80) if k%16==0 else (180,180,180))
        if k%16==0: d.text((x+2,H+42), f"{k}\n{t0+k*T:.1f}s", fill=(255,200,200), font=font)
# rms curve
rms = librosa.feature.rms(y=y, hop_length=hop)[0]
pts = [(j/len(rms)*W, H+200-rms[j]*300) for j in range(0,len(rms),4)]
d.line(pts, fill=(80,200,255))
canvas.save(sys.argv[2])
json.dump({"T":T,"t0":t0,"bpm":60/T,"dur":dur}, open(sys.argv[3],"w"))
