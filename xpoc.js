async function fetchAndPrintXPost(url) {
  try {
    const oEmbedUrl = `https://publish.twitter.com/oembed?url=${encodeURIComponent(url)}`;
    const response = await fetch(oEmbedUrl);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    const data = await response.json();

    // Print key details
    console.log('Post Content:');
    console.log('Author:', data.author_name);
    console.log('Author URL:', data.author_url);
    console.log('HTML:', data.html);
    console.log('Text:', data.html.replace(/<[^>]*>/g, '').trim()); // Extract plain text from HTML
    console.log('Full Data:', JSON.stringify(data, null, 2));
  } catch (error) {
    console.error('Error fetching post:', error.message);
  }
}

// Example usage:

const result = await fetchAndPrintXPost('https://x.com/chongdashu/status/2010021203948494939');
console.log(result);