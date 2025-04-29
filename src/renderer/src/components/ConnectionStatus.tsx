import React from 'react';
import { motion } from 'framer-motion';
import { useQueue } from '../context/QueueContext';

const ConnectionStatus: React.FC = () => {
  const { isConnected } = useQueue();

  if (isConnected) {
    return (
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="flex items-center px-3 py-1 bg-green-50 border border-green-100 rounded-lg text-green-700 text-sm"
      >
        <motion.div
          animate={{ scale: [1, 1.2, 1] }}
          transition={{ duration: 2, repeat: Infinity }}
          className="w-2 h-2 rounded-full bg-green-500 mr-2"
        />
        <span>متصل</span>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      className="flex items-center px-3 py-1 bg-red-50 border border-red-100 rounded-lg text-red-700 text-sm"
    >
      <motion.div
        animate={{ opacity: [1, 0.4, 1] }}
        transition={{ duration: 1, repeat: Infinity }}
        className="w-2 h-2 rounded-full bg-red-500 mr-2"
      />
      <span>غير متصل</span>
    </motion.div>
  );
};

export default ConnectionStatus;
