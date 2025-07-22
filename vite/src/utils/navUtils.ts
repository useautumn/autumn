export const updateSearchParams = ({
  navigate,
  params,
}: {
  navigate: any;
  params: Record<string, string>;
}) => {
  const url = new URL(window.location.href);
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });

  // console.log("New url:", url.toString());
  navigate({
    search: url.search,
  });
};
