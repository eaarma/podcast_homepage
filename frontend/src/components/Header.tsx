import { useEffect, useState } from "react";

const Header: React.FC = () => {
  const [content, setContent] = useState<{
    coverImage: string;
    mobileImage: string;
  } | null>(null);

  useEffect(() => {
    fetch("https://podcast-homepage.onrender.com/api/content")
      .then((res) => res.json())
      .then((data) => setContent(data))
      .catch((err) => console.error(err));
  }, []);

  if (!content) return null;

  return (
    <div className="w-full">
      <picture>
        <source media="(max-width: 768px)" srcSet={content.mobileImage} />
        <img
          src={content.coverImage}
          alt="Header"
          className="w-full h-auto object-cover"
        />
      </picture>
    </div>
  );
};

export default Header;
