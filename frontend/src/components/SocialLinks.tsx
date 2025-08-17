import { FaInstagram, FaYoutube, FaSpotify } from "react-icons/fa";

interface SocialLinksProps {
  instagram: string;
  youtube: string;
  spotify: string;
}

const SocialLinks: React.FC<SocialLinksProps> = ({
  instagram,
  youtube,
  spotify,
}) => {
  return (
    <div className="flex justify-center space-x-8 my-6">
      <a
        href={instagram}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Instagram"
        className="text-pink-600 hover:text-pink-800 text-3xl"
      >
        <FaInstagram />
      </a>
      <a
        href={youtube}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="YouTube"
        className="text-red-600 hover:text-red-800 text-3xl"
      >
        <FaYoutube />
      </a>
      <a
        href={spotify}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Spotify"
        className="text-green-600 hover:text-green-800 text-3xl"
      >
        <FaSpotify />
      </a>
    </div>
  );
};

export default SocialLinks;
