import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import "./App.css";

function App() {
  const [fonts, setFonts] = useState<string[]>([]);
  const [message, setMessage] = useState("Loading...");

  useEffect(() => {
    async function loadFonts() {
      try {
        console.log("Fetching fonts...");
        const systemFonts = await invoke<string[]>("get_system_fonts");
        console.log("Fonts loaded:", systemFonts.length);
        setFonts(systemFonts);
        setMessage(`Loaded ${systemFonts.length} fonts`);
      } catch (error) {
        console.error("Error:", error);
        setMessage(`Error: ${error}`);
      }
    }
    loadFonts();
  }, []);

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <h1 className="text-3xl font-bold mb-4">Font Checker - Simple Test</h1>
      <p className="mb-4">{message}</p>
      <div className="bg-white p-4 rounded shadow">
        <h2 className="text-xl font-bold mb-2">Fonts ({fonts.length})</h2>
        <ul className="max-h-96 overflow-y-auto">
          {fonts.slice(0, 20).map((font) => (
            <li key={font} className="py-1 border-b">{font}</li>
          ))}
        </ul>
        {fonts.length > 20 && <p className="mt-2 text-gray-600">...and {fonts.length - 20} more</p>}
      </div>
    </div>
  );
}

export default App;
