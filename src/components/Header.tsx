import { version } from '../../package.json';

const Header = () => {
  return (
    <header className="mb-5 rounded-3xl border border-white/10 bg-white/5 p-5 shadow-card backdrop-blur">
      <p className="text-xs uppercase tracking-[0.28em] text-accentSoft/90">Sleep Mixer</p>
      <h1 className="mt-2 text-2xl font-semibold text-white">Craft your perfect night soundscape</h1>
      <p className="mt-2 text-sm leading-relaxed text-slate-300">
        Blend soothing layers to relax, focus, or drift to sleep.<sup style={{fontSize:'0.65em', verticalAlign:'super', marginLeft:'0.25em', color:'#89b8ff', fontWeight:500}}>v{version}</sup>
      </p>
    </header>
  );
};

export default Header;
