function Layout({ children, ecstasyMode }) {
  return (
    <div className="flex items-center justify-center h-[100dvh] min-h-[100dvh] w-full max-w-[430px] mx-auto p-0 sm:p-4 bg-night-black overflow-hidden">
      <div
        className={`relative flex h-full w-full flex-col overflow-hidden bg-night-black rounded-2xl sm:rounded-[3rem] transition-all duration-500 ${
          ecstasyMode ? 'neon-frame scale-[0.98]' : 'border-4 border-accent-red'
        }`}
      >
        {ecstasyMode && (
          <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden rounded-2xl sm:rounded-[3rem]">
            <div className="absolute top-[-50%] left-[-50%] w-[200%] h-[200%] bg-[conic-gradient(from_0deg,transparent,#ff003c,transparent,#bc13fe,transparent)] animate-[spin_4s_linear_infinite] opacity-20"></div>
            <div className="absolute inset-4 bg-night-black rounded-[2.5rem] opacity-40"></div>
          </div>
        )}
        <div className="relative z-10 flex flex-col flex-1 min-h-0 vibe-gradient pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)]">{children}</div>
      </div>
    </div>
  );
}

export default Layout;
