interface IntroductionProps {
  title: string;
  description: string;
}

const Introduction: React.FC<IntroductionProps> = ({ title, description }) => {
  return (
    <div className="max-w-3xl mx-auto px-4 text-center my-8">
      <h1 className="text-4xl font-bold mb-4">{title}</h1>
      <p className="text-lg text-gray-400">{description}</p>
    </div>
  );
};

export default Introduction;
