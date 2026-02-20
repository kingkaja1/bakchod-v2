import { useMemo } from 'react';

function StoryBar({ searchQuery = '', users, onSelectUser }) {
  const filteredUsers = useMemo(() => {
    if (!searchQuery) return users;
    return users.filter((user) =>
      user.name.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [searchQuery, users]);

  return (
    <div className="flex w-full overflow-x-auto px-6 py-3 no-scrollbar gap-4 shrink-0 transition-all duration-300">
      {filteredUsers.length > 0 ? (
        filteredUsers.map((user) => (
          <div
            key={user.id}
            onClick={() => onSelectUser(user)}
            className="flex flex-col items-center gap-1 w-12 text-center group cursor-pointer shrink-0"
          >
            <div className="relative">
              <div
                className={`w-11 h-11 bg-center bg-no-repeat aspect-square bg-cover rounded-full border-2 p-0.5 transition-all group-hover:scale-105 active:scale-90 ${
                  user.status === 'vibing'
                    ? 'border-green-500 shadow-[0_0_8px_rgba(34,197,94,0.4)]'
                    : user.id === '1'
                    ? 'border-accent-red shadow-[0_0_8px_rgba(255,0,60,0.3)]'
                    : user.status === 'offline'
                    ? 'border-gray-800 opacity-60 grayscale'
                    : 'border-white/10'
                }`}
                style={{ backgroundImage: `url(${user.avatar})` }}
              />
              {user.id === '1' && (
                <div className="absolute bottom-0 right-0 size-3.5 rounded-full bg-accent-red flex items-center justify-center border border-night-black shadow-lg">
                  <span className="material-symbols-outlined text-white text-[8px] font-bold">add</span>
                </div>
              )}
              {user.status === 'online' && user.id !== '1' && (
                <div className="absolute bottom-0.5 right-0.5 size-2 rounded-full bg-green-500 border border-night-black" />
              )}
            </div>
            <p
              className={`text-[8px] font-bold tracking-tight truncate w-full uppercase ${
                user.status === 'offline' ? 'text-gray-500' : 'text-white'
              }`}
            >
              {user.name}
            </p>
          </div>
        ))
      ) : (
        <div className="flex items-center justify-center h-10 px-4">
          <p className="text-white/20 text-[8px] uppercase font-bold tracking-widest whitespace-nowrap">
            {searchQuery ? 'No match' : 'No contacts yet'}
          </p>
        </div>
      )}
    </div>
  );
}

export default StoryBar;
