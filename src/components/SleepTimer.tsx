import { useEffect, useMemo, useState } from 'react';

interface SleepTimerProps {
  onExpire: () => void;
}

const TIMER_OPTIONS = [15, 30, 45, 60, 90, 120];

const SleepTimer = ({ onExpire }: SleepTimerProps) => {
  const [selectedMinutes, setSelectedMinutes] = useState(30);
  const [endAt, setEndAt] = useState<number | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!endAt) return;
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, [endAt]);

  useEffect(() => {
    if (!endAt) return;
    if (Date.now() >= endAt) {
      onExpire();
      setEndAt(null);
    }
  }, [endAt, now, onExpire]);

  const secondsLeft = useMemo(() => {
    if (!endAt) return 0;
    return Math.max(0, Math.floor((endAt - now) / 1000));
  }, [endAt, now]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
      .toString()
      .padStart(2, '0');
    const secs = (seconds % 60).toString().padStart(2, '0');
    return `${mins}:${secs}`;
  };

  return (
    <section className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-card">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold text-white">Sleep Timer</h2>
        {endAt ? <span className="text-xs text-accentSoft">Ends in {formatTime(secondsLeft)}</span> : null}
      </div>

      <div className="flex items-center gap-2">
        <select
          className="w-full rounded-xl border border-white/10 bg-midnight/90 px-3 py-2 text-sm text-white"
          value={selectedMinutes}
          onChange={(event) => setSelectedMinutes(Number(event.target.value))}
        >
          {TIMER_OPTIONS.map((minutes) => (
            <option key={minutes} value={minutes}>
              {minutes} minutes
            </option>
          ))}
        </select>
        <button
          type="button"
          className="rounded-xl bg-accent px-4 py-2 text-sm font-semibold text-deepBlue"
          onClick={() => setEndAt(Date.now() + selectedMinutes * 60 * 1000)}
        >
          Set
        </button>
        <button
          type="button"
          className="rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-sm font-medium text-white"
          onClick={() => setEndAt(null)}
        >
          Clear
        </button>
      </div>
    </section>
  );
};

export default SleepTimer;
