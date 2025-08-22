import { useEffect, useState } from "react";
import Footer from "./components/Footer";
import Header from "./components/Header";
import HomePage from "./pages/HomePage";
import "./App.css";

function App() {
  const [contentData, setContentData] = useState<any>(null);

  useEffect(() => {
    fetch("https://podcast-homepage.onrender.com/api/content")
      .then((res) => res.json())
      .then((data) => setContentData(data))
      .catch((err) => console.error("Failed to fetch content:", err));
  }, []);

  if (!contentData) {
    return <div className="text-center py-10">Loading...</div>;
  }

  return (
    <div className="flex flex-col min-h-screen items-center">
      <div className="w-full">
        <Header />
      </div>

      <main className="flex-grow flex flex-col items-center justify-start w-full max-w-screen-md px-4">
        <HomePage data={contentData} />
      </main>

      <footer className="w-full">
        <Footer brand={contentData.footer?.brand || "Your Page Name"} />
      </footer>
    </div>
  );
}

export default App;
