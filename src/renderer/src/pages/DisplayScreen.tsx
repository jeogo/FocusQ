import React, { useEffect, useState } from 'react';
import DisplayScreen from '../screens/DisplayScreen';

// هذا الملف الآن فقط يمرر displayId المستخرج من URL أو hash إلى شاشة العرض الاحترافية

const DisplayScreenPage: React.FC = () => {
  const [displayId, setDisplayId] = useState<number>(1);

  useEffect(() => {
    // استخراج displayId من URL أو hash
    const urlParams = new URLSearchParams(window.location.search);
    const displayParam = urlParams.get('display');
    if (displayParam && !isNaN(parseInt(displayParam))) {
      setDisplayId(parseInt(displayParam));
      return;
    }
    const hash = window.location.hash;
    const hashDisplayIdMatch = hash.match(/display-(\d+)/);
    if (hashDisplayIdMatch && hashDisplayIdMatch[1]) {
      setDisplayId(parseInt(hashDisplayIdMatch[1]));
    }
  }, []);

  useEffect(() => {
    document.title = `شاشة العرض ${displayId}`;
  }, [displayId]);

  return (
    <DisplayScreen displayId={displayId} />
  );
};

export default DisplayScreenPage;
