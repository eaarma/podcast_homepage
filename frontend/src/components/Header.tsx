interface HeaderProps {
  desktop: string; // e.g., "/images/background.jpg"
  mobile: string; // e.g., "/images/background-small.jpg"
}

const Header: React.FC<HeaderProps> = ({ desktop, mobile }) => {
  return (
    <div className="w-full">
      <img
        src={desktop} // fallback
        srcSet={`${mobile} 640w, ${desktop} 1024w`}
        sizes="(max-width: 640px) 100vw, 100vw"
        alt="Header"
        className="w-full h-auto object-cover"
      />
    </div>
  );
};

export default Header;
