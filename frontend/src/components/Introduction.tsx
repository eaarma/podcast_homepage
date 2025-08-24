interface IntroductionProps {
  title: string;
  description: string;
}

const Introduction: React.FC<IntroductionProps> = ({ title, description }) => {
  return (
    <div className="max-w-3xl mx-auto px-4 text-center my-8">
      <h1 className="text-xl md:text-2xl font-bold mb-4 truncate">{title}</h1>{" "}
      <p className="text-lg">{description}</p>
    </div>
  );
};

export default Introduction;
