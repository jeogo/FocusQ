import { useEffect, useState, memo, useRef } from 'react'
import CustomerScreen from './screens/CustomerScreen'
import DisplayScreen from './screens/DisplayScreen'
import EmployeeScreen from './screens/EmployeeScreen'
import AdminScreen from './screens/AdminScreen'
import { QueueProvider } from './context/QueueContext'

// Apply memo to the App component to prevent unnecessary rerenders
const App = memo(function App(): JSX.Element {
  const [screen, setScreen] = useState<string | null>(null)
  const [counterNumber, setCounterNumber] = useState<number | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const mountCount = useRef(0)

  // DEBUG: Track component mounts
  useEffect(() => {
    mountCount.current += 1
    console.log(`[DEBUG] App component mounted/updated (count: ${mountCount.current})`)

    return () => {
      console.log('[DEBUG] App component unmounted')
    }
  }, [])

  useEffect(() => {
    let isMounted = true;
    // Function to determine which screen to show
    const determineScreen = () => {
      if (!isMounted) return;
      setIsLoading(true);

      // When in development mode, use the URL query parameters
      const urlParams = new URLSearchParams(window.location.search);
      const screenParam = urlParams.get('screen');
      const counterParam = urlParams.get('counter');

      // When in production, use the hash
      const hash = window.location.hash.substring(1);

      // Screen type priority: URL param > hash > default (customer)
      let detectedScreen = 'customer';
      let detectedCounter: number | null = null;

      if (screenParam) {
        detectedScreen = screenParam;

        if (screenParam === 'employee' && counterParam) {
          detectedCounter = parseInt(counterParam, 10);
        }
      } else if (hash) {
        // Handle hash format like #employee/1
        const parts = hash.split('/');
        detectedScreen = parts[0];

        if (detectedScreen === 'employee' && parts.length > 1) {
          detectedCounter = parseInt(parts[1], 10);
        }
      }

      console.log(`Screen determined: ${detectedScreen}${detectedCounter ? ` (Counter: ${detectedCounter})` : ''}`);

      // Set appropriate title based on screen type
      switch (detectedScreen) {
        case 'customer':
          document.title = 'خدمة العملاء - FocusQ';
          break;
        case 'display':
          document.title = 'شاشة العرض - FocusQ';
          break;
        case 'employee':
          document.title = `شاشة الموظف${detectedCounter ? ` - مكتب ${detectedCounter}` : ''} - FocusQ`;
          break;
        case 'admin':
          document.title = 'لوحة تحكم الإدارة - FocusQ';
          break;
      }

      if (isMounted) {
        setScreen(detectedScreen);
        setCounterNumber(detectedCounter);
        setIsLoading(false);
      }
    };

    determineScreen();

    // Listen for hash changes and URL changes
    window.addEventListener('hashchange', determineScreen);

    return () => {
      isMounted = false;
      window.removeEventListener('hashchange', determineScreen);
    };
  }, []);

  // DEBUG: Track state changes
  useEffect(() => {
    console.log(`[DEBUG] Screen changed to: ${screen}, counter: ${counterNumber}`)
  }, [screen, counterNumber])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-500"></div>
      </div>
    )
  }

  // Render the appropriate screen
  const renderScreen = () => {
    switch (screen) {
      case 'customer':
        return <CustomerScreen />
      case 'display':
        return <DisplayScreen />
      case 'employee':
        return <EmployeeScreen counterId={counterNumber || 1} />
      case 'admin':
        return <AdminScreen />
      default:
        return <CustomerScreen />
    }
  }

  return (
    <QueueProvider>
      {renderScreen()}
    </QueueProvider>
  )
});

export default App
