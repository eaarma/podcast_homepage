export const siteContentSchema = {
  type: "object",
  required: [
    "coverImage",
    "mobileImage", // <-- add here
    "title",
    "description",
    "videoLink",
    "socials",
    "footer",
  ],
  additionalProperties: false,
  properties: {
    coverImage: { type: "string" },
    mobileImage: { type: "string" }, // <-- add here
    title: { type: "string" },
    description: { type: "string" },
    videoLink: {
      type: "object",
      required: ["title", "youtubeLink"],
      properties: {
        title: { type: "string" },
        youtubeLink: { type: "string" },
      },
      additionalProperties: false,
    },
    socials: {
      type: "object",
      required: ["spotify", "youtube", "instagram"],
      properties: {
        spotify: { type: "string" },
        youtube: { type: "string" },
        instagram: { type: "string" },
      },
      additionalProperties: false,
    },
    footer: {
      type: "object",
      required: ["brand"],
      properties: {
        brand: { type: "string" },
      },
      additionalProperties: false,
    },
  },
};
