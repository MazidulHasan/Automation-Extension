import org.openqa.selenium.By;
import org.openqa.selenium.WebDriver;
import org.openqa.selenium.WebElement;
import org.openqa.selenium.chrome.ChromeDriver;
import org.openqa.selenium.support.ui.Select;
import org.testng.annotations.Test;
import org.testng.annotations.BeforeMethod;
import org.testng.annotations.AfterMethod;

public class RecordedTest {
    private WebDriver driver;

    @BeforeMethod
    public void setUp() {
        driver = new ChromeDriver();
        driver.manage().window().maximize();
    }

    @Test
    public void recordedTestCase() {
        driver.get("https://www.saucedemo.com/");

        // Step 1: Enter "standard_user" in "Username"
        driver.findElement(By.cssSelector("input[placeholder='Username']")).sendKeys("standard_user");

        // Step 2: Enter "secret_sauce" in "Password"
        driver.findElement(By.cssSelector("input[placeholder='Password']")).sendKeys("secret_sauce");

        // Step 3: Click "Login"
        driver.findElement(By.xpath("//button[text()='Login']")).click();

        // Step 4: Click "Sauce Labs Bolt T-Shirt"
        driver.findElement(By.xpath("//div[text()='Sauce Labs Bolt T-Shirt']")).click();

        // Step 5: Click "Add to cart"
        driver.findElement(By.xpath("//button[text()='Add to cart']")).click();

        // Step 6: Click shopping cart
        driver.findElement(By.className("shopping_cart_link")).click();

        // Step 7: Click "Checkout"
        driver.findElement(By.xpath("//button[text()='Checkout']")).click();

    }

    @AfterMethod
    public void tearDown() {
        if (driver != null) {
            driver.quit();
        }
    }
}
