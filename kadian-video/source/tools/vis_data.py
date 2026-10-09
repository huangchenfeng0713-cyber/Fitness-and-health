import numpy as np, json, os, librosa
S = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SR = 48000
x = np.load(f"{S}/audio/stem_music.npy")
N = len(x)
def u8(a): return np.clip(np.round(a*255), 0, 255).astype(np.uint8)
# waveform peaks @400Hz
w = SR//400; n = N//w
pk = np.abs(x[:n*w]).reshape(n, w).max(1); pk = pk/np.percentile(pk, 99.5)
wave = u8(np.clip(pk, 0, 1))
# envelopes @120Hz from STFT
hop = SR//120
Z = np.abs(librosa.stft(x, n_fft=2048, hop_length=hop))
f = librosa.fft_frequencies(sr=SR, n_fft=2048)
def nz(a, p=99): return np.clip(a/np.percentile(a, p), 0, 1)
rms = nz(np.sqrt((Z**2).mean(0)))
low = nz(Z[(f > 30) & (f < 150)].sum(0))
high = nz(Z[f > 5000].sum(0))
L = np.log1p(Z*10); flux = np.maximum(0, np.diff(L, axis=1, prepend=L[:, :1])).sum(0); flux = nz(flux, 99.5)
lowflux = np.maximum(0, np.diff(np.log1p(Z[(f>30)&(f<150)]*10), axis=1, prepend=0)).sum(0); lowflux = nz(lowflux, 99.5)
# 32 log bands @120Hz (dB scaled)
edges = np.geomspace(40, 16000, 33)
def band(i):
    m = (f >= edges[i]) & (f < edges[i+1])
    if not m.any(): m = np.abs(f - np.sqrt(edges[i]*edges[i+1])) == np.abs(f - np.sqrt(edges[i]*edges[i+1])).min()
    return Z[m].mean(0)
B = np.stack([band(i) for i in range(32)])
B = librosa.amplitude_to_db(B, ref=np.max); B = np.clip((B + 60)/60, 0, 1)
env = np.stack([rms, low, high, flux, lowflux])
meta = {"wave_rate": 400, "wave_len": int(len(wave)), "env_rate": 120, "env_len": int(env.shape[1]), "bands": 32}
blob = wave.tobytes() + u8(env).tobytes() + u8(B.T).tobytes()   # env: 5 x L (row-major), spec: L x 32
open(f"{S}/film/audio_data.bin", "wb").write(blob)
json.dump(meta, open(f"{S}/film/audio_data.json", "w"))
print(meta, len(blob))
