import React, { useState, useEffect } from 'react';
import { TitleScreen } from './components/TitleScreen';
import { SurvivorMode } from './components/modes/SurvivorMode';
import { InvaderMode } from './components/modes/InvaderMode';
import { AnomalyMode } from './components/modes/AnomalyMode';
import { GameOverModal } from './components/GameOverModal';

type ModeType = 'survivor' | 'invader' | 'anomaly';
type ScreenState = 'title' | 'playing' | 'gameover';

export default function App() {
  const [screen, setScreen] = useState<ScreenState>('title');
  const [mode, setMode] = useState<ModeType>('survivor');
  const [lastScore, setLastScore] = useState<number>(0);
  const [lastStats, setLastStats] = useState<Record<string, number | string>>({});
  const [isNewHigh, setIsNewHigh] = useState<boolean>(false);

  // Persistent high scores
  const [highScores, setHighScores] = useState<{
    survivor: number;
    invader: number;
    anomaly: number;
  }>({
    survivor: 0,
    invader: 0,
    anomaly: 0,
  });

  useEffect(() => {
    try {
      const s = parseInt(localStorage.getItem('endroller_high_survivor') || '0', 10);
      const i = parseInt(localStorage.getItem('endroller_high_invader') || '0', 10);
      const a = parseInt(localStorage.getItem('endroller_high_anomaly') || '0', 10);
      setHighScores({
        survivor: isNaN(s) ? 0 : s,
        invader: isNaN(i) ? 0 : i,
        anomaly: isNaN(a) ? 0 : a,
      });
    } catch {}
  }, []);

  const handleStartMode = (selectedMode: ModeType) => {
    setMode(selectedMode);
    setScreen('playing');
  };

  const handleGameOver = (score: number, stats: Record<string, number | string>) => {
    setLastScore(score);
    setLastStats(stats);

    const prevBest = highScores[mode];
    const isRecord = score > prevBest;
    setIsNewHigh(isRecord);

    if (isRecord) {
      const updated = { ...highScores, [mode]: score };
      setHighScores(updated);
      try {
        localStorage.setItem(`endroller_high_${mode}`, String(score));
      } catch {}
    }

    setScreen('gameover');
  };

  const handleRetry = () => {
    setScreen('playing');
  };

  const handleBackToTitle = () => {
    setScreen('title');
  };

  return (
    <div className="relative w-screen h-screen bg-black text-white overflow-hidden select-none">
      {/* Subtle Film Grain Noise Texture */}
      <div className="absolute inset-0 film-grain opacity-40 pointer-events-none z-30" />

      {/* Subtle Scanlines effect for retro projector ambiance */}
      <div className="absolute inset-0 scanlines opacity-20 pointer-events-none z-30" />

      {/* Screen Router */}
      {screen === 'title' && (
        <TitleScreen onSelectMode={handleStartMode} highScores={highScores} />
      )}

      {screen === 'playing' && (
        <div className="w-full h-full">
          {mode === 'survivor' && (
            <SurvivorMode onBackToMenu={handleBackToTitle} onGameOver={handleGameOver} />
          )}
          {mode === 'invader' && (
            <InvaderMode onBackToMenu={handleBackToTitle} onGameOver={handleGameOver} />
          )}
          {mode === 'anomaly' && (
            <AnomalyMode onBackToMenu={handleBackToTitle} onGameOver={handleGameOver} />
          )}
        </div>
      )}

      {screen === 'gameover' && (
        <div className="w-full h-full relative">
          {/* Keep active game view frozen behind modal */}
          {mode === 'survivor' && (
            <SurvivorMode onBackToMenu={handleBackToTitle} onGameOver={() => {}} />
          )}
          {mode === 'invader' && (
            <InvaderMode onBackToMenu={handleBackToTitle} onGameOver={() => {}} />
          )}
          {mode === 'anomaly' && (
            <AnomalyMode onBackToMenu={handleBackToTitle} onGameOver={() => {}} />
          )}

          <GameOverModal
            mode={mode}
            score={lastScore}
            isNewHigh={isNewHigh}
            stats={lastStats}
            onRetry={handleRetry}
            onHome={handleBackToTitle}
          />
        </div>
      )}
    </div>
  );
}
