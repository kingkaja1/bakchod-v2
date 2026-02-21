import React, { useEffect, useRef } from 'react';

declare global {
  interface Window {
    JitsiMeetExternalAPI: new (domain: string, options: Record<string, unknown>) => {
      executeCommand: (cmd: string, ...args: unknown[]) => void;
      dispose: () => void;
    };
  }
}

type JitsiCallViewProps = {
  roomName: string;
  displayName: string;
  mode: 'audio' | 'video';
  onEnd: () => void;
  className?: string;
};

export default function JitsiCallView({ roomName, displayName, mode, onEnd, className = '' }: JitsiCallViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const apiRef = useRef<InstanceType<typeof window.JitsiMeetExternalAPI> | null>(null);

  useEffect(() => {
    const Jitsi = window.JitsiMeetExternalAPI;
    if (!Jitsi || !containerRef.current) return;

    const domain = 'meet.jit.si';
    const options = {
      roomName,
      parentNode: containerRef.current,
      width: '100%',
      height: '100%',
      userInfo: { displayName },
      configOverwrite: {
        startWithAudioMuted: false,
        startWithVideoMuted: mode === 'audio',
        prejoinPageEnabled: false,
      },
      interfaceConfigOverwrite: {
        SHOW_JITSI_WATERMARK: false,
        SHOW_WATERMARK_FOR_GUESTS: false,
      },
    };

    const api = new Jitsi(domain, options);
    apiRef.current = api;

    api.executeCommand('displayName', displayName);
    if (mode === 'audio') {
      api.executeCommand('toggleVideo');
    }

    const handleVideoConferenceLeft = () => onEnd();
    if (typeof api.addEventListener === 'function') {
      api.addEventListener('videoConferenceLeft', handleVideoConferenceLeft);
    }

    return () => {
      if (apiRef.current) {
        apiRef.current.dispose();
        apiRef.current = null;
      }
    };
  }, [roomName, displayName, mode, onEnd]);

  return <div ref={containerRef} className={`w-full h-full min-h-[300px] bg-black rounded-xl overflow-hidden ${className}`} />;
}
