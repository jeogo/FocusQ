import React from 'react';

interface LogoProps {
  className?: string;
}

const Logo: React.FC<LogoProps> = ({ className = '' }) => {
  return (
    <div className={`relative ${className}`}>
      <div className="flex items-center justify-center w-full h-full">
        <div className="absolute inset-0 bg-gradient-to-br from-blue-500 to-blue-700 rounded-full opacity-10"></div>
        <div className="z-10 font-bold text-blue-600 text-center flex flex-col justify-center items-center h-full">
          <span className="text-lg lg:text-2xl tracking-tight">FocusQ</span>
          <span className="text-xs text-blue-400">إدارة الطابور</span>
        </div>
      </div>
    </div>
  );
};

export default Logo;
