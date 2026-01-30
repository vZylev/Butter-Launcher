import React from "react";

const DragBar: React.FC<{ left?: React.ReactNode }> = ({ left }) => {
  const handleMinimize = () => {
    window.ipcRenderer.send("minimize-window");
  };
  const handleClose = () => {
    window.ipcRenderer.send("close-window");
  };

  return (
    <div
      id="frame"
      className="w-full h-9 flex items-center justify-between select-none"
    >
      <div className="flex items-center gap-2 pl-2">
        {left}
      </div>

      <div className="flex items-center justify-end">
      <button
        className="no-drag w-8 h-8 flex items-center justify-center text-lg text-gray-300 hover:bg-[#23293a] hover:text-white rounded transition focus:outline-none mr-1"
        onClick={handleMinimize}
        title="Minimizar"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <rect y="7.5" width="16" height="1" rx="0.5" fill="currentColor" />
        </svg>
      </button>
      <button
        className="no-drag w-8 h-8 flex items-center justify-center text-lg text-gray-300 hover:bg-red-600 hover:text-white rounded transition focus:outline-none mr-2"
        onClick={handleClose}
        title="Cerrar"
      >
        <svg
          width="16"
          height="16"
          viewBox="0 0 16 16"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <line
            x1="4.35355"
            y1="4.35355"
            x2="11.6464"
            y2="11.6464"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
          <line
            x1="11.6464"
            y1="4.35355"
            x2="4.35355"
            y2="11.6464"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
          />
        </svg>
      </button>
      </div>
    </div>
  );
};

export default DragBar;
