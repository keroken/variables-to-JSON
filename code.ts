figma.showUI(__html__);

figma.ui.resize(500, 500);

figma.ui.onmessage = async(pluginMessage)=> {

  await figma.loadFontAsync({ family: "Rubik", style: "Regular" });

  const nodes:SceneNode[] = [];

  const postComponentSet = figma.root.findOne(node => node.type == "COMPONENT_SET" && node.name == "post") as ComponentSetNode;

  let selectedVariant;

  if (pluginMessage.darkModeState === true) {
    switch(pluginMessage.imageVariant) {
      case "2" :
        // dark mode, single image
        selectedVariant = postComponentSet.findOne(node => node.type == "COMPONENT" && node.name == "Image=single, Dark mode=true") as ComponentNode;
        break;
      case "3" :
        // dark mode, carousel
        selectedVariant = postComponentSet.findOne(node => node.type == "COMPONENT" && node.name == "Image=carousel, Dark mode=true") as ComponentNode;
        break;
      default :
        // dark mode, no image
        selectedVariant = postComponentSet.findOne(node => node.type == "COMPONENT" && node.name == "Image=none, Dark mode=true") as ComponentNode;
        break;
    }
  } else {
    switch(pluginMessage.imageVariant) {
      case "2" :
        // light mode, single image
        selectedVariant = postComponentSet.findOne(node => node.type == "COMPONENT" && node.name == "Image=single, Dark mode=false") as ComponentNode;
        break;
      case "3" :
        // light mode, carousel
        selectedVariant = postComponentSet.findOne(node => node.type == "COMPONENT" && node.name == "Image=carousel, Dark mode=false") as ComponentNode;
        break;
      default :
        // light mode, no image
        selectedVariant = postComponentSet.defaultVariant as ComponentNode;
        break;
    }
  }

  const newPost = selectedVariant.createInstance();

  const templateName = newPost.findOne(node => node.name == "displayName" && node.type == "TEXT") as TextNode;
  const templateUserName = newPost.findOne(node => node.name == "@username" && node.type == "TEXT") as TextNode;
  const templateDescription = newPost.findOne(node => node.name == "description" && node.type == "TEXT") as TextNode;
  const numLikes = newPost.findOne(node => node.name == "likesLabel" && node.type == "TEXT") as TextNode;

  templateName.characters = pluginMessage.name;
  templateUserName.characters = pluginMessage.username;
  templateDescription.characters = pluginMessage.description;
  numLikes.characters = (Math.floor(Math.random() * 1000) + 1).toString();

  nodes.push(newPost);

  figma.viewport.scrollAndZoomIntoView(nodes);

  figma.closePlugin();
};
