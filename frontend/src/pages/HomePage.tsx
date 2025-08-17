import Introduction from "../components/Introduction";
import VoiceRecorder from "../components/VoiceRecorder";
import PreviousEpisode from "../components/PreviousEpisode";
import SocialLinks from "../components/SocialLinks";

interface HomePageProps {
  data: any;
}

const HomePage: React.FC<HomePageProps> = ({ data }) => {
  return (
    <>
      <Introduction title={data.title} description={data.description} />
      <VoiceRecorder />
      <PreviousEpisode
        linkTitle={data.videoLink?.title}
        linkTarget={data.videoLink?.youtubeLink}
      />
      <SocialLinks
        instagram={data.socials?.instagram}
        youtube={data.socials?.youtube}
        spotify={data.socials?.spotify}
      />
    </>
  );
};

export default HomePage;
