import { useState, useEffect } from "react";

const PageDataEditor = () => {
  const token = localStorage.getItem("admin-token");
  const [authorized, setAuthorized] = useState(!!token);
  const [loading, setLoading] = useState(true);
  const [formData, setFormData] = useState({
    coverImage: "",
    mobileImage: "",
    title: "",
    description: "",
    linkTitle: "",
    linkTarget: "",
    spotify: "",
    youtube: "",
    instagram: "",
    brand: "",
  });

  const [previewDesktop, setPreviewDesktop] = useState("");
  const [previewMobile, setPreviewMobile] = useState("");
  const [selectedDesktopFile, setSelectedDesktopFile] = useState<File | null>(
    null
  );
  const [selectedMobileFile, setSelectedMobileFile] = useState<File | null>(
    null
  );

  const useProd = true;
  const API_BASE = useProd
    ? "https://podcast-homepage.onrender.com"
    : "http://localhost:4000";

  useEffect(() => {
    if (!token) {
      setAuthorized(false);
      setLoading(false);
      return;
    }

    fetch(`${API_BASE}/api/content`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error("Unauthorized");
        return res.json();
      })
      .then((data) => {
        setFormData({
          coverImage: data.coverImage || "",
          mobileImage: data.mobileImage || "",
          title: data.title || "",
          description: data.description || "",
          linkTitle: data.videoLink?.title || "",
          linkTarget: data.videoLink?.youtubeLink || "",
          spotify: data.socials?.spotify || "",
          youtube: data.socials?.youtube || "",
          instagram: data.socials?.instagram || "",
          brand: data.footer?.brand || "",
        });
        setPreviewDesktop(data.coverImage || "");
        setPreviewMobile(data.mobileImage || "");
        setAuthorized(true);
      })
      .catch(() => setAuthorized(false))
      .finally(() => setLoading(false));
  }, [token]);

  const handleInputChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  };

  const handleDesktopSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedDesktopFile(file);
    setPreviewDesktop(URL.createObjectURL(file));
  };

  const handleMobileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setSelectedMobileFile(file);
    setPreviewMobile(URL.createObjectURL(file));
  };

  const uploadImage = async (file: File, type: "desktop" | "mobile") => {
    const form = new FormData();
    form.append("image", file);

    const res = await fetch(
      `${API_BASE}/uploadimage${type === "mobile" ? "?type=mobile" : ""}`,
      {
        method: "POST",
        body: form,
        headers: { Authorization: `Bearer ${token}` },
      }
    );

    if (!res.ok) throw new Error("Image upload failed");
    const data = await res.json();
    return data.imageUrl;
  };

  const handleSubmit = async () => {
    let desktopUrl = formData.coverImage;
    let mobileUrl = formData.mobileImage;

    try {
      if (selectedDesktopFile) {
        desktopUrl = await uploadImage(selectedDesktopFile, "desktop");
      }
      if (selectedMobileFile) {
        mobileUrl = await uploadImage(selectedMobileFile, "mobile");
      }
    } catch (err) {
      alert(err instanceof Error ? err.message : "Upload failed");
      return;
    }

    const payload = {
      coverImage: desktopUrl,
      mobileImage: mobileUrl,
      title: formData.title,
      description: formData.description,
      videoLink: {
        title: formData.linkTitle,
        youtubeLink: formData.linkTarget,
      },
      socials: {
        spotify: formData.spotify,
        youtube: formData.youtube,
        instagram: formData.instagram,
      },
      footer: { brand: formData.brand },
    };

    const res = await fetch(`${API_BASE}/api/content`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(payload),
    });

    if (res.ok) {
      alert("Content updated successfully!");
      setSelectedDesktopFile(null);
      setSelectedMobileFile(null);
    } else {
      alert("Failed to update content.");
    }
  };

  if (loading)
    return (
      <div className="text-center mt-10 text-gray-600 dark:text-gray-300">
        Loading editor...
      </div>
    );
  if (!authorized)
    return (
      <div className="text-center mt-10 text-red-600 dark:text-red-400 font-medium">
        You are not authorized to edit this page.
      </div>
    );

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 text-black dark:text-white bg-white dark:bg-gray-900 rounded-lg shadow">
      <h2 className="text-2xl font-bold mb-6 text-center">Edit Page Content</h2>

      {/* Desktop Image */}
      <div className="mb-4">
        <label className="block text-sm font-medium mb-1">
          Cover Image (Desktop)
        </label>
        <input
          type="file"
          accept="image/*"
          onChange={handleDesktopSelect}
          className="w-full p-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded"
        />
        {previewDesktop && (
          <img
            src={previewDesktop}
            alt="Preview Desktop"
            className="mt-3 h-40 w-full object-cover rounded-lg shadow"
          />
        )}
      </div>

      {/* Mobile Image */}
      <div className="mb-4">
        <label className="block text-sm font-medium mb-1">
          Cover Image (Mobile)
        </label>
        <input
          type="file"
          accept="image/*"
          onChange={handleMobileSelect}
          className="w-full p-2 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded"
        />
        {previewMobile && (
          <img
            src={previewMobile}
            alt="Preview Mobile"
            className="mt-3 h-40 w-full object-cover rounded-lg shadow"
          />
        )}
      </div>

      {/* Other dynamic fields */}
      {[
        { label: "Title", name: "title" },
        { label: "Description", name: "description", textarea: true },
        { label: "Link Title", name: "linkTitle" },
        { label: "Link Target", name: "linkTarget" },
        { label: "Spotify", name: "spotify" },
        { label: "YouTube", name: "youtube" },
        { label: "Instagram", name: "instagram" },
        { label: "Brand Name", name: "brand" },
      ].map(({ label, name, textarea }) => (
        <div key={name} className="mb-4">
          <label className="block text-sm font-medium mb-1">{label}</label>
          {textarea ? (
            <textarea
              name={name}
              value={(formData as any)[name]}
              onChange={handleInputChange}
              rows={4}
              className="w-full p-2 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-black dark:text-white"
            />
          ) : (
            <input
              name={name}
              value={(formData as any)[name]}
              onChange={handleInputChange}
              className="w-full p-2 border border-gray-300 dark:border-gray-700 rounded bg-white dark:bg-gray-800 text-black dark:text-white"
            />
          )}
        </div>
      ))}

      <button
        onClick={handleSubmit}
        className="mt-4 bg-green-600 hover:bg-green-700 text-secondary px-4 py-2 rounded w-full transition"
      >
        Save Changes
      </button>
    </div>
  );
};

export default PageDataEditor;
