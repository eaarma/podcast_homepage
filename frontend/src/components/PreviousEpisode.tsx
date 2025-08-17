interface PreviousEpisodeProps {
  linkTitle: string;
  linkTarget: string;
}

const PreviousEpisode: React.FC<PreviousEpisodeProps> = ({
  linkTitle,
  linkTarget,
}) => {
  return (
    <div className="max-w-screen-xl mx-auto px-2 sm:px-12 my-8">
      <h2 className="text-2xl font-semibold mb-4 text-center">{linkTitle}</h2>
      <div className="w-full" style={{ aspectRatio: "16 / 9" }}>
        <iframe
          className="w-full h-full rounded"
          src={linkTarget}
          title={linkTitle}
          frameBorder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        ></iframe>
      </div>
    </div>
  );
};

export default PreviousEpisode;
