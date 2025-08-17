import { useNavigate } from "react-router-dom";

interface FooterProps {
  brand: string;
}

const Footer: React.FC<FooterProps> = ({ brand }) => {
  const year = new Date().getFullYear();
  const navigate = useNavigate();

  return (
    <footer className="w-full bg-gray-100 border-t border-gray-300 text-sm text-gray-600">
      <div className="max-w-6xl mx-auto px-4 py-4 flex items-center relative">
        {/* Centered Text */}
        <div className="absolute left-1/2 transform -translate-x-1/2 text-center">
          <span>
            &copy; {year} {brand} &mdash; page by{" "}
            <a
              href="mailto:yourbusiness@email.com"
              className="text-blue-600 underline hover:text-blue-500 transition-colors"
            >
              yourbusiness@email.com
            </a>
          </span>
        </div>

        {/* Right-Aligned Subtle Button */}
        <div className="ml-auto">
          <button
            onClick={() => navigate("/admin/login")}
            className="text-xs text-gray-400 hover:text-gray-600 opacity-20 hover:opacity-60 transition-opacity"
            title="Admin Login"
          >
            🛠️
          </button>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
