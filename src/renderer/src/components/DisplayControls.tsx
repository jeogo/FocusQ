import { useState } from 'react'

interface DisplayControlsProps {
  displayId: number
}

export default function DisplayControls({ displayId }: DisplayControlsProps) {
  const [isOpen, setIsOpen] = useState(false)

  const createNewDisplay = async () => {
    if (window.api?.display) {
      try {
        const result = await window.api.display.createNewDisplay();
        console.log('Created new display screen:', result);
      } catch (error) {
        console.error('Error creating new display screen:', error);
      }
    } else {
      // For browser mode, open a new window with incremented display ID
      const newUrl = new URL(window.location.href);

      if (newUrl.search) {
        // Handle URL parameters
        const params = new URLSearchParams(newUrl.search);
        params.set('display', String(displayId + 1));
        newUrl.search = params.toString();
      } else {
        // Handle hash-based routing
        const base = newUrl.hash.split('/')[0] || '#display';
        newUrl.hash = `${base}/${displayId + 1}`;
      }

      window.open(newUrl.toString(), '_blank', 'width=900,height=700');
    }
  }

  return (
    <div className="fixed bottom-2 left-2 z-50">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="bg-gray-800 bg-opacity-50 text-white w-8 h-8 rounded-full flex items-center justify-center hover:bg-opacity-70"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M11.49 3.17c-.38-1.56-2.6-1.56-2.98 0a1.532 1.532 0 01-2.286.948c-1.372-.836-2.942.734-2.106 2.106.54.886.061 2.042-.947 2.287-1.561.379-1.561 2.6 0 2.978a1.532 1.532 0 01.947 2.287c-.836 1.372.734 2.942 2.106 2.106a1.532 1.532 0 012.287.947c.379 1.561 2.6 1.561 2.978 0a1.533 1.533 0 012.287-.947c1.372.836 2.942-.734 2.106-2.106a1.533 1.533 0 01.947-2.287c1.561-.379 1.561-2.6 0-2.978a1.532 1.532 0 01-.947-2.287c.836-1.372-.734-2.942-2.106-2.106a1.532 1.532 0 01-2.287-.947zM10 13a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute bottom-10 left-0 bg-white rounded-lg shadow-lg p-3 border border-gray-200 min-w-[200px]">
          <button
            onClick={createNewDisplay}
            className="flex items-center text-sm text-gray-700 hover:bg-gray-100 w-full px-3 py-2 rounded-md"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
            </svg>
            إضافة شاشة جديدة
          </button>
          <button
            onClick={() => window.location.reload()}
            className="flex items-center text-sm text-gray-700 hover:bg-gray-100 w-full px-3 py-2 rounded-md"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 mr-2" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4 2a1 1 0 011 1v2.101a7.002 7.002 0 0111.601 2.566 1 1 0 11-1.885.666A5.002 5.002 0 005.999 7H9a1 1 0 010 2H4a1 1 0 01-1-1V3a1 1 0 011-1zm.008 9.057a1 1 0 011.276.61A5.002 5.002 0 0014.001 13H11a1 1 0 110-2h5a1 1 0 011 1v5a1 1 0 11-2 0v-2.101a7.002 7.002 0 01-11.601-2.566 1 1 0 01.61-1.276z" clipRule="evenodd" />
            </svg>
            تحديث الشاشة
          </button>
        </div>
      )}
    </div>
  )
}
