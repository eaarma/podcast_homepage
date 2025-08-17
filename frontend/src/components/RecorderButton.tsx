export default function RecorderButton({
  isRecording,
  startRecording,
  stopRecording,
  isProcessing,
  recordingTime,
}) {
  const formatTime = (s: number) => {
    if (!isFinite(s) || s <= 0) return "0:00";
    const mm = Math.floor(s / 60);
    const ss = Math.floor(s % 60);
    return `${mm}:${ss < 10 ? "0" + ss : ss}`;
  };
  return (
    <div className="flex items-center space-x-4 mb-4">
      {!isRecording ? (
        // Idle - sleek green mic button
        <button
          onClick={startRecording}
          className="w-14 h-14 rounded-full flex items-center justify-center bg-gradient-to-br from-green-500 to-green-600 shadow-lg hover:from-green-600 hover:to-green-700 transition-all disabled:opacity-50"
          disabled={isProcessing}
          title="Start Recording"
        >
          <MicIcon />
        </button>
      ) : (
        // Recording - red blinking dot inside border
        <button
          onClick={stopRecording}
          className="relative w-14 h-14 rounded-full border-4 border-red-600 flex items-center justify-center hover:border-red-700 transition-colors shadow-lg"
          title="Stop Recording"
        >
          {/* Blinking animation */}
          <span className="w-4 h-4 rounded-full bg-red-600 animate-ping absolute"></span>
          <span className="w-4 h-4 rounded-full bg-red-600"></span>
        </button>
      )}

      <span className="text-lg font-mono">{formatTime(recordingTime)}</span>
    </div>
  );
}

// Minimalistic mic SVG
function MicIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      fill="white"
      viewBox="0 0 24 24"
      className="w-6 h-6"
    >
      <path d="M12 14a3 3 0 0 0 3-3V5a3 3 0 1 0-6 0v6a3 3 0 0 0 3 3z" />
      <path d="M19 11a1 1 0 0 0-2 0 5 5 0 0 1-10 0 1 1 0 0 0-2 0 7 7 0 0 0 6 6.92V21H9a1 1 0 1 0 0 2h6a1 1 0 1 0 0-2h-2v-3.08A7 7 0 0 0 19 11z" />
    </svg>
  );
}
