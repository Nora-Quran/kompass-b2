"""Generate the studio recordings for one shard: audio/<lang>/<xx>/<hash>.mp3 for every line of tts/<lang>.tsv.
Runs on GitHub Actions (see .github/workflows/tts.yml). usage: python tts/generate.py SHARD NSHARDS OUTDIR
"""
import os, subprocess, sys, tempfile, wave

shard, nshards, outdir = int(sys.argv[1]), int(sys.argv[2]), sys.argv[3]
existing = set(open("existing.txt", encoding="utf-8").read().split()) if os.path.exists("existing.txt") else set()
MODELS = {"de": "voices/de.onnx", "fa": "voices/fa.onnx"}

from piper import PiperVoice
try:
    from piper import SynthesisConfig
except ImportError:
    SynthesisConfig = None

def synth(voice, text, path):
    with wave.open(path, "wb") as wf:
        if hasattr(voice, "synthesize_wav"):
            cfg = SynthesisConfig(length_scale=1.0, noise_scale=0.667, noise_w_scale=0.8) if SynthesisConfig else None
            voice.synthesize_wav(text, wf, syn_config=cfg) if cfg else voice.synthesize_wav(text, wf)
        else:
            voice.synthesize(text, wf, length_scale=1.0, sentence_silence=0.25)

done = skipped = failed = 0
for lang, model in MODELS.items():
    if not os.path.exists(model):
        print("missing model", model); continue
    voice = PiperVoice.load(model)
    lines = [l.rstrip("\n").split("\t", 1) for l in open(f"tts/{lang}.tsv", encoding="utf-8") if "\t" in l]
    for i, (h, text) in enumerate(lines):
        if i % nshards != shard:
            continue
        rel = f"audio/{lang}/{h[:2]}/{h}.mp3"
        if rel in existing:
            skipped += 1; continue
        out = os.path.join(outdir, rel)
        os.makedirs(os.path.dirname(out), exist_ok=True)
        try:
            with tempfile.NamedTemporaryFile(suffix=".wav") as tmp:
                synth(voice, text, tmp.name)
                subprocess.run(["ffmpeg", "-loglevel", "error", "-y", "-i", tmp.name, "-af",
                                "silenceremove=start_periods=1:start_threshold=-50dB,areverse,silenceremove=start_periods=1:start_threshold=-50dB,areverse,apad=pad_dur=0.12",
                                "-ac", "1", "-ar", "22050", "-codec:a", "libmp3lame", "-b:a", "32k", out], check=True)
            done += 1
        except Exception as e:
            failed += 1; print("FAILED", lang, h, text[:60], e)
        if done and done % 200 == 0:
            print(lang, "done", done, flush=True)
print(f"shard {shard}: generated {done}, skipped {skipped}, failed {failed}")
