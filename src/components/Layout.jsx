function Layout({ children, ecstasyMode }) {
  return (
    <div className="flex items-center justify-center min-h-screen p-0 sm:p-4 bg-night-black overflow-hidden">
      <div
        className={`relative flex h-[100dvh] max-h-[932px] w-full max-w-[430px] mx-auto flex-col overflow-hidden bg-night-black rounded-[3rem] transition-all duration-500 ${
          ecstasyMode ? 'neon-frame scale-[0.98]' : 'border-4 border-white/10'
        }`}
      >
        {ecstasyMode && (
          <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden rounded-[3rem]">
            <div className="absolute top-[-50%] left-[-50%] w-[200%] h-[200%] bg-[conic-gradient(from_0deg,transparent,#ff003c,transparent,#bc13fe,transparent)] animate-[spin_4s_linear_infinite] opacity-20"></div>
            <div className="absolute inset-4 bg-night-black rounded-[2.5rem] opacity-40"></div>
          </div>
        )}
        <div className="relative z-10 flex flex-col h-full vibe-gradient">{children}</div>
      </div>
    </div>
  );
}

export default Layout;
