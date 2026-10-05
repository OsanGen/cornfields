"""Extract small deterministic speech-energy tracks from the existing licensed voices."""
import subprocess,struct,json,math
from pathlib import Path
root=Path(__file__).resolve().parents[1]; tracks={}; hz=30
for f in sorted((root/'assets/audio/prologue').glob('*.mp3')):
 raw=subprocess.run(['ffmpeg','-v','error','-i',str(f),'-f','f32le','-ac','1','-ar','12000','-'],capture_output=True,check=True).stdout
 x=struct.unpack('<%sf'%(len(raw)//4),raw); values=[]; size=12000//hz
 for at in range(0,len(x),size):
  w=x[at:at+size];values.append(math.sqrt(sum(v*v for v in w)/max(1,len(w))))
 ref=sorted(values)[min(len(values)-1,int(len(values)*.92))] or 1
 values=[min(1,max(0,(v/ref-.055)/.945))**.7 for v in values]
 # Symmetric local smoothing avoids flicker while retaining zero-energy pauses.
 values=[round(255*(values[max(0,i-1)]*.2+v*.6+values[min(len(values)-1,i+1)]*.2)) for i,v in enumerate(values)]
 tracks[f.stem]={'duration':round(len(x)/12000,5),'energy':values}
(root/'src/prologue-speech.js').write_text('// Generated from existing audio files by scripts/build-prologue-envelopes.py.\nexport const SPEECH_HZ='+str(hz)+';\nexport const SPEECH_ENVELOPES='+json.dumps(tracks,separators=(',',':'))+';\nexport function sampleSpeech(id,seconds){const t=SPEECH_ENVELOPES[id];if(!t||seconds<0||seconds>=t.duration)return 0;const u=seconds*SPEECH_HZ,i=Math.floor(u),a=t.energy[i]||0,b=t.energy[i+1]||0;return(a+(b-a)*(u-i))/255;}\n')
print('Speech envelopes',len(tracks),'bytes',(root/'src/prologue-speech.js').stat().st_size)
