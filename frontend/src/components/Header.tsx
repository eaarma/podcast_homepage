const Header: React.FC = () => {
  return (
    <div className="w-full">
      <picture>
        <source
          media="(max-width: 768px)"
          srcSet="https://podcast-homepage.onrender.com/images/background-small.jpg"
        />
        <img
          src="https://podcast-homepage.onrender.com/images/background.jpg"
          alt="Header"
          className="w-full h-auto object-cover"
        />
      </picture>
    </div>
  );
};

export default Header;
