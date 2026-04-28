/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { Chat } from './components/Chat';
import { ImageClustering } from './components/ImageClustering';
import { Settings } from './components/Settings';

import { VoiceInterface } from './components/VoiceInterface';

export default function App() {
  const [currentTab, setCurrentTab] = useState('chat');

  return (
    <div className="flex h-screen bg-[#0a0a0a] text-white font-sans antialiased selection:bg-purple-500/30">
      <Sidebar currentTab={currentTab} setCurrentTab={setCurrentTab} />
      
      <main className="flex-1 w-full overflow-hidden relative">
        {currentTab === 'chat' && <Chat />}
        {currentTab === 'clustering' && <ImageClustering />}
        {currentTab === 'settings' && <Settings />}
      </main>
    </div>
  );
}
